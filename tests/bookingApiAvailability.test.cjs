const {test} = require("node:test");
const assert = require("node:assert/strict");
const {availability} = require("../functions/bookingApiDomain");
const {createBookingApiService} = require("../functions/bookingApi");
const date = "2099-07-05";
const profiles = ["a", "b", "c", "d", "e", "f"].map(id => ({id, displayName: id}));
const records = profiles.map(profile => ({userId: profile.id, timeSlot: "16:45",
  status: profile.id === "f" ? "onRequest" : "available"}));
const bookings = [{id: "existing", date, timeIndex: 7, numberOfPeople: 3, assignedPilots: ["a", "b", "c"]}];
const slot = (recs = records, books = bookings) => availability(date, {}, recs, books, profiles).find(s => s.time === "16:45");
test("two confirmed spaces and one on request stay separate", () => {
  const value = slot();
  assert.equal(value.availableSpots, 2); assert.equal(value.onRequestSpots, 1);
  assert.equal(value.totalAvailableSpots, 3); assert.equal(value.capacity, 6);
});
test("on-request-only capacity is never directly bookable", () => {
  const value = slot(records, [{...bookings[0], numberOfPeople: 5}]);
  assert.equal(value.availableSpots, 0); assert.equal(value.onRequestSpots, 1);
});
test("full and overbooked departures do not expose request spaces", () => {
  for (const numberOfPeople of [6, 7]) {
    const value = slot(records, [{...bookings[0], numberOfPeople}]);
    assert.equal(value.availableSpots, 0); assert.equal(value.onRequestSpots, 0);
  }
});
test("pilot consent recorded as available makes the space bookable", () => {
  const value = slot(records.map(r => ({...r, status: "available"})));
  assert.equal(value.availableSpots, 3); assert.equal(value.onRequestSpots, 0);
});
test("duplicate records and unknown profiles never increase capacity", () => {
  const value = slot([...records, {...records[5]}, {userId: "unknown", timeSlot: "16:45", status: "onRequest"}]);
  assert.equal(value.availableSpots, 2); assert.equal(value.onRequestSpots, 1);
});
test("cancelled bookings still consume capacity and deleted ones do not", () => {
  assert.equal(slot(records, [{...bookings[0], bookingStatus: "cancelled"}]).availableSpots, 2);
  assert.equal(slot(records, [{...bookings[0], bookingStatus: "deleted"}]).availableSpots, 5);
});
function fixture({recs = records, books = bookings, existing} = {}) {
  const writes = [];
  const keyData = {name: "Offline fixture", createdBy: "fixture-owner", scopes: ["bookings:create", "bookings:update"]};
  const snapshot = data => ({exists: data !== undefined, data: () => data});
  const docs = items => ({docs: items.map(item => ({id: item.id, data: () => item}))});
  const get = ref => {
    if (ref.path === "integrationApiKeys/key") return snapshot(keyData);
    if (ref.path === "timeOverrides/" + date) return snapshot({});
    if (ref.path === "availability") return docs(recs);
    if (ref.path === "bookings") return docs(books);
    if (ref.path === "userProfiles") return docs(profiles);
    if (ref.path === "bookings/existing") return snapshot(existing || books.find(b => b.id === "existing"));
    return snapshot(undefined);
  };
  const ref = path => ({path, get: async () => get({path}), doc: id => ref(path + "/" + (id || "new")), where: () => ref(path)});
  const tx = {get: async r => get(r), create: (...v) => writes.push(v), set: (...v) => writes.push(v), update: (...v) => writes.push(v)};
  const db = {collection: ref, doc: ref, runTransaction: fn => fn(tx)};
  return {service: createBookingApiService(db), key: {...keyData, id: "key", ref: ref("integrationApiKeys/key")}, writes};
}
test("API transaction rejects a third passenger without writing any records", async () => {
  const f = fixture();
  await assert.rejects(f.service.mutate(f.key, "create", null,
    {customerName: "Fixture", date, time: "16:45", numberOfPeople: 3}, "offline-create-3"),
  e => e.code === "capacity_conflict" && e.message.includes("consent"));
  assert.equal(f.writes.length, 0);
});
test("API transaction can book the two regular spaces", async () => {
  const f = fixture();
  const result = await f.service.mutate(f.key, "create", null,
    {customerName: "Fixture", date, time: "16:45", numberOfPeople: 2}, "offline-create-2");
  assert.equal(result.status, 201); assert.ok(f.writes.length > 0);
});
test("increasing a booking cannot consume on-request capacity", async () => {
  const f = fixture();
  await assert.rejects(f.service.mutate(f.key, "update", "existing", {numberOfPeople: 6}, "offline-update-6"),
    e => e.code === "capacity_conflict");
  assert.equal(f.writes.length, 0);
});
test("only the recorded pilot consent increases API booking capacity", async () => {
  const f = fixture({recs: records.map(r => ({...r, status: "available"}))});
  const result = await f.service.mutate(f.key, "create", null,
    {customerName: "Fixture", date, time: "16:45", numberOfPeople: 3}, "offline-consented");
  assert.equal(result.status, 201);
});
test("moving an assigned on-request pilot requires consent even when regular capacity exists", async () => {
  const existing = {...bookings[0], timeIndex: 2, numberOfPeople: 1, assignedPilots: ["f"]};
  const f = fixture({books: [existing], existing});
  await assert.rejects(f.service.mutate(f.key, "update", "existing", {time: "16:45"}, "offline-move-request"),
    e => e.code === "assignment_conflict");
  assert.equal(f.writes.length, 0);
});
