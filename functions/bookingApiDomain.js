// API-only domain helpers. Existing browser booking behavior is not changed.
const OWNER_EMAIL = "pccbasting@gmail.com";
const SCOPES = ["bookings:read", "availability:read", "bookings:create", "bookings:update",
  "bookings:status", "bookings:delete", "booking-requests:create"];
const STATUSES = ["unconfirmed", "confirmed", "pending", "cancelled", "no show"];
const TEXT_FIELDS = ["customerName", "email", "phoneNumber", "pickupLocation", "notes", "officeNotes", "bookingSource"];
const DETAIL_FIELDS = [...TEXT_FIELDS, "date", "time", "numberOfPeople", "flightType", "preferredContact"];
const PUBLIC_FIELDS = [...TEXT_FIELDS, "date", "timeIndex", "numberOfPeople", "flightType", "preferredContact",
  "bookingStatus", "createdAt", "assignedPilots"];
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function check(condition, message, status = 400, code = "invalid_argument") {
  if (!condition) throw new ApiError(status, code, message);
}
function isOwner(auth) {
  return !!(auth && auth.token && auth.token.email_verified === true &&
    typeof auth.token.email === "string" && auth.token.email.toLowerCase() === OWNER_EMAIL);
}
function dateValue(value) {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a date in YYYY-MM-DD format.");
  const parsed = new Date(`${value}T12:00:00Z`);
  check(!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, "Invalid calendar date.");
  return value;
}
function timeValue(value) {
  check(typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value), "Use a time in HH:mm format.");
  const [hour, minute] = value.split(":").map(Number);
  check(hour < 24 && minute < 60, "Invalid time.");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function safeTime(value) {
  try { return timeValue(value); } catch { return null; }
}
function baseSlots(date) {
  dateValue(date);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month === 12 || month === 1) return ["8:30", "9:45", "11:00", "12:15", "13:45", "15:00"];
  if (month === 2 || month === 11 || (month === 10 && day >= 11)) {
    return ["8:00", "9:15", "10:30", "12:00", "13:30", "14:45", "16:00"];
  }
  if (month === 3) return ["7:30", "8:30", "9:45", "11:00", "12:15", "13:45", "15:00", "16:00"];
  return ["7:30", "8:30", "9:45", "11:00", "12:30", "14:00", "15:30", "16:45"];
}
function slotsForDate(date, config = {}) {
  const base = baseSlots(date).map((time, timeIndex) => ({
    timeIndex, time: timeValue((config.overrides || {})[timeIndex] || time), lookupTime: timeValue(time),
  }));
  return base.concat((config.additionalSlots || []).map((time, index) => ({
    timeIndex: 1000 + index, time: timeValue(time), lookupTime: timeValue(time),
  })));
}
function normalizedName(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function matchesName(name, query) {
  const parts = normalizedName(name || "").split(" ");
  return normalizedName(query).split(" ").filter(Boolean).every(part => parts.some(word => word.startsWith(part)));
}
function requireScope(key, scope) {
  check(key.scopes.includes(scope), `This key requires ${scope}.`, 403, "permission_denied");
}
function validateBody(body, kind, key) {
  check(body && typeof body === "object" && !Array.isArray(body), "A JSON object is required.");
  const allowed = kind === "request" ? DETAIL_FIELDS.filter(field => field !== "officeNotes") :
    [...DETAIL_FIELDS, "bookingStatus"];
  check(Object.keys(body).length > 0, "Provide at least one field.");
  for (const field of Object.keys(body)) check(allowed.includes(field), `Unsupported field: ${field}.`);
  if (kind === "update") {
    if (Object.keys(body).some(field => field !== "bookingStatus")) requireScope(key, "bookings:update");
    if (Object.hasOwn(body, "bookingStatus")) requireScope(key, "bookings:status");
  }
  const output = {...body};
  for (const field of TEXT_FIELDS) {
    if (!Object.hasOwn(body, field)) continue;
    check(typeof body[field] === "string" && body[field].length <= (field.endsWith("Notes") ||
      field === "notes" ? 4000 : 300), `Invalid ${field}.`);
    output[field] = body[field].trim();
  }
  if (Object.hasOwn(body, "customerName")) check(output.customerName.length > 0, "Customer name cannot be empty.");
  if (output.email) check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email), "Invalid email address.");
  if (Object.hasOwn(body, "date")) dateValue(body.date);
  if (Object.hasOwn(body, "time")) output.time = timeValue(body.time);
  if (Object.hasOwn(body, "numberOfPeople")) {
    check(Number.isInteger(body.numberOfPeople) && body.numberOfPeople > 0 && body.numberOfPeople <= 100,
        "Passenger count must be an integer between 1 and 100.");
  }
  if (Object.hasOwn(body, "bookingStatus")) check(STATUSES.includes(body.bookingStatus), "Unsupported booking status.");
  if (Object.hasOwn(body, "flightType")) {
    check(["sensational", "classic", "early bird"].includes(body.flightType), "Invalid flight type.");
  }
  if (Object.hasOwn(body, "preferredContact")) {
    check(["phone", "email", null].includes(body.preferredContact), "Invalid preferred contact method.");
  }
  if (kind !== "update") {
    for (const field of ["customerName", "date", "time", "numberOfPeople"]) {
      check(Object.hasOwn(output, field), `${field} is required.`);
    }
    if (kind === "request") check(!!output.email, "Email is required for booking requests.");
  }
  return output;
}
function isFuture(date, time, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return date > today || (date === today && time > `${parts.hour}:${parts.minute}`);
}
function availability(date, config, records, bookings, profiles, excludeId) {
  const profileIds = new Set(profiles.map(profile => profile.id));
  return slotsForDate(date, config).map(slot => {
    const available = new Set(records.filter(record => profileIds.has(record.userId) &&
      record.status !== "unavailable" && safeTime(record.timeSlot) === slot.lookupTime).map(record => record.userId));
    const onRequest = new Set(records.filter(record => available.has(record.userId) &&
      record.status === "onRequest" && safeTime(record.timeSlot) === slot.lookupTime).map(record => record.userId));
    // Match the existing form: all non-deleted bookings (including cancelled/no-show) consume space.
    const taken = bookings.filter(booking => booking.id !== excludeId && booking.bookingStatus !== "deleted" &&
      booking.timeIndex === slot.timeIndex)
        .reduce((sum, booking) => sum + (booking.numberOfPeople || booking.span || 1), 0);
    const totalAvailableSpots = Math.max(0, available.size - taken);
    const onRequestSpots = Math.min(totalAvailableSpots, onRequest.size);
    // Reserve on-request pilots for human approval; API booking capacity excludes them.
    return {time: slot.time, timeIndex: slot.timeIndex, capacity: available.size,
      availableSpots: totalAvailableSpots - onRequestSpots, onRequestSpots, totalAvailableSpots,
      bookable: isFuture(date, slot.time)};
  });
}
function presentBooking(snapshot) {
  const source = snapshot.data();
  const output = {id: snapshot.id};
  for (const field of PUBLIC_FIELDS) {
    if (source[field] !== undefined) output[field] = source[field] && typeof source[field].toDate === "function" ?
      source[field].toDate().toISOString() : source[field];
  }
  return output;
}
module.exports = {OWNER_EMAIL, SCOPES, STATUSES, PUBLIC_FIELDS, ApiError, check, isOwner, dateValue,
  timeValue, safeTime, baseSlots, slotsForDate, normalizedName, matchesName, requireScope, validateBody,
  isFuture, availability, presentBooking};
