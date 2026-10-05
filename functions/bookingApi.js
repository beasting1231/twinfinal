const crypto = require("node:crypto");
const express = require("express");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {FieldPath, FieldValue} = require("firebase-admin/firestore");
const {SCOPES, PUBLIC_FIELDS, ApiError, check, isOwner, dateValue, timeValue, safeTime, normalizedName,
  matchesName, requireScope, validateBody, slotsForDate, isFuture, availability, presentBooking} =
  require("./bookingApiDomain");
const {createMcpHandler} = require("./bookingMcp");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const rows = snapshot => snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
const canonical = value => JSON.stringify(value, Object.keys(value || {}).sort());
const keyMetadata = doc => {
  const data = doc.data();
  return {id: doc.id, name: data.name, prefix: data.prefix, scopes: data.scopes,
    createdAt: data.createdAt, expiresAt: data.expiresAt, revokedAt: data.revokedAt, lastUsedAt: data.lastUsedAt};
};
function validKey(data, now = Date.now()) {
  check(data && !data.revokedAt && (!data.expiresAt || Date.parse(data.expiresAt) > now),
      "API key is invalid, expired, or revoked.", 401, "unauthenticated");
}
function createBookingApiService(db) {
  const keys = db.collection("integrationApiKeys");
  async function owner(auth) {
    check(isOwner(auth), "Only the verified owner can manage API keys.", 403, "permission_denied");
    const account = await admin.auth().getUser(auth.uid);
    check(!account.disabled && account.emailVerified && account.email &&
      account.email.toLowerCase() === auth.token.email.toLowerCase(), "Owner account is unavailable.",
    403, "permission_denied");
  }
  async function createKey(auth, data) {
    await owner(auth);
    check(data && typeof data.name === "string" && data.name.trim().length > 0 && data.name.length <= 80,
        "Give the key a name of up to 80 characters.");
    check(Array.isArray(data.scopes) && data.scopes.length > 0 && data.scopes.every(scope => SCOPES.includes(scope)),
        "Select at least one valid permission.");
    let expiresAt = null;
    if (data.expiresAt) {
      const expiry = new Date(data.expiresAt);
      check(Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now(), "Expiry must be in the future.");
      expiresAt = expiry.toISOString();
    }
    const id = crypto.randomBytes(12).toString("hex");
    const secret = `twin_${id}_${crypto.randomBytes(32).toString("hex")}`;
    const record = {name: data.name.trim(), scopes: [...new Set(data.scopes)], prefix: `twin_${id}`,
      secretHash: hash(secret), createdAt: new Date().toISOString(), createdBy: auth.uid,
      expiresAt, revokedAt: null, lastUsedAt: null};
    await keys.doc(id).create(record);
    return {key: keyMetadata({id, data: () => record}), secret};
  }
  async function listKeys(auth) {
    await owner(auth);
    return {keys: (await keys.get()).docs.map(keyMetadata).sort((a, b) => b.createdAt.localeCompare(a.createdAt))};
  }
  async function revokeKey(auth, data) {
    await owner(auth);
    check(data && /^[a-f0-9]{24}$/.test(data.id), "Invalid key ID.");
    await db.runTransaction(async tx => {
      const ref = keys.doc(data.id);
      const doc = await tx.get(ref);
      check(doc.exists, "Key not found.", 404, "not_found");
      if (!doc.data().revokedAt) tx.update(ref, {revokedAt: new Date().toISOString()});
    });
    return {revoked: true};
  }
  async function authenticate(header) {
    const match = /^Bearer (twin_([a-f0-9]{24})_[a-f0-9]{64})$/.exec(header || "");
    check(match, "A valid Bearer API key is required.", 401, "unauthenticated");
    const ref = keys.doc(match[2]);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      validKey(data);
      check(typeof data.secretHash === "string" && data.secretHash.length === 64 &&
        crypto.timingSafeEqual(Buffer.from(data.secretHash, "hex"), Buffer.from(hash(match[1]), "hex")),
      "Invalid API key.", 401, "unauthenticated");
      const minute = Math.floor(Date.now() / 60000);
      const usage = db.collection("integrationApiUsage").doc(ref.id);
      const prior = (await tx.get(usage)).data() || {};
      const count = prior.minute === minute ? prior.count + 1 : 1;
      check(count <= 120, "Rate limit exceeded; retry in one minute.", 429, "rate_limited");
      tx.set(usage, {minute, count});
      tx.update(ref, {lastUsedAt: new Date().toISOString()});
      return {...data, id: ref.id, ref};
    });
  }
  async function dayData(date, tx) {
    const get = ref => tx ? tx.get(ref) : ref.get();
    // Read-only queries: never backfill, normalize, or rewrite existing records.
    const [config, records, bookings, profiles] = await Promise.all([
      get(db.doc(`timeOverrides/${date}`)), get(db.collection("availability").where("date", "==", date)),
      get(db.collection("bookings").where("date", "==", date)), get(db.collection("userProfiles")),
    ]);
    return {config: config.data() || {}, records: rows(records), bookings: rows(bookings), profiles: rows(profiles)};
  }
  async function getAvailability(query) {
    const date = dateValue(query.date);
    const day = await dayData(date);
    let slots = availability(date, day.config, day.records, day.bookings, day.profiles);
    if (query.time !== undefined) slots = slots.filter(slot => slot.time === timeValue(query.time));
    check(slots.length > 0, "Time is not a scheduled departure.", 404, "not_found");
    return {date, timezone: "Europe/Zurich", slots};
  }
  async function withDepartureTimes(bookings) {
    const dates = [...new Set(bookings.map(booking => booking.date).filter(date => {
      try { dateValue(date); return true; } catch { return false; }
    }))];
    const configs = new Map(await Promise.all(dates.map(async date =>
      [date, (await db.doc(`timeOverrides/${date}`).get()).data() || {}])));
    return bookings.map(booking => ({...booking, timezone: "Europe/Zurich",
      time: configs.has(booking.date) ?
        (slotsForDate(booking.date, configs.get(booking.date)).find(slot => slot.timeIndex === booking.timeIndex) || {})
            .time || null : null}));
  }
  async function listBookings(query) {
    check(query.date || query.name, "Provide date or name.");
    if (query.date) dateValue(query.date);
    if (query.name !== undefined) {
      check(typeof query.name === "string" && query.name.length <= 100 && normalizedName(query.name).length >= 2,
          "Name must contain at least two letters or digits, up to 100 characters.");
    }
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    check(Number.isInteger(limit) && limit >= 1 && limit <= 100, "Limit must be between 1 and 100.");
    const filterHash = hash(canonical({date: query.date || "", name: query.name || ""}));
    let after = null;
    if (query.cursor) {
      try {
        check(typeof query.cursor === "string" && query.cursor.length < 1000, "Invalid cursor.");
        const cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
        check(cursor.filter === filterHash && typeof cursor.id === "string" &&
          /^[a-zA-Z0-9_-]{1,1500}$/.test(cursor.id), "Cursor does not match this search.");
        after = cursor.id;
      } catch { throw new ApiError(400, "invalid_argument", "Invalid search cursor."); }
    }
    let search = db.collection("bookings");
    if (query.date) search = search.where("date", "==", query.date);
    search = search.orderBy(FieldPath.documentId()).select(...PUBLIC_FIELDS);
    if (after) search = search.startAfter(after);
    // Bounded scan gives complete, immediately consistent name search without modifying old bookings/indexes.
    const snapshot = await search.limit(500).get();
    const result = [];
    let examined = 0;
    for (const doc of snapshot.docs) {
      examined++;
      const booking = doc.data();
      if (booking.bookingStatus !== "deleted" && (!query.name || matchesName(booking.customerName, query.name))) {
        result.push(presentBooking(doc));
      }
      if (result.length === limit) break;
    }
    const hasMore = examined < snapshot.size || snapshot.size === 500;
    const cursor = hasMore && examined ? Buffer.from(JSON.stringify({
      id: snapshot.docs[examined - 1].id, filter: filterHash,
    })).toString("base64url") : null;
    return {bookings: await withDepartureTimes(result), nextCursor: cursor};
  }
  async function getBooking(id) {
    check(typeof id === "string" && /^[a-zA-Z0-9_-]{1,1500}$/.test(id), "Invalid booking ID.");
    const doc = await db.collection("bookings").doc(id).get();
    check(doc.exists && doc.data().bookingStatus !== "deleted", "Booking not found.", 404, "not_found");
    return {booking: (await withDepartureTimes([presentBooking(doc)]))[0]};
  }
  async function mutate(key, kind, id, rawBody, idempotencyKey) {
    if (id) check(typeof id === "string" && /^[a-zA-Z0-9_-]{1,1500}$/.test(id), "Invalid booking ID.");
    const scope = {create: "bookings:create", request: "booking-requests:create", delete: "bookings:delete"}[kind];
    if (scope) requireScope(key, scope);
    const body = kind === "delete" ? {} : validateBody(rawBody, kind, key);
    check(typeof idempotencyKey === "string" && /^[\x21-\x7e]{8,128}$/.test(idempotencyKey),
        "An Idempotency-Key header of 8–128 visible ASCII characters is required.");
    const fingerprint = hash(canonical({kind, id: id || "", body: canonical(body)}));
    const receiptRef = db.collection("integrationApiRequests").doc(hash(`${key.id}:${idempotencyKey}`));
    const collection = db.collection(kind === "request" ? "bookingRequests" : "bookings");
    const ref = id ? collection.doc(id) : collection.doc();
    return db.runTransaction(async tx => {
      const liveKey = (await tx.get(key.ref)).data();
      validKey(liveKey);
      if (scope) requireScope(liveKey, scope);
      if (kind === "update") validateBody(body, kind, liveKey);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        check(receipt.data().fingerprint === fingerprint, "Idempotency-Key was already used for another request.",
            409, "conflict");
        return receipt.data().response;
      }
      const existing = id ? await tx.get(ref) : null;
      if (id) check(existing.exists, "Booking not found.", 404, "not_found");
      const before = existing ? existing.data() : {};
      if (kind === "update") {
        check(before.bookingStatus !== "deleted" && !before.isBlocked,
            "Deleted bookings and blocked spots cannot be edited through this API.", 409, "conflict");
      }
      if (kind === "delete") check(!before.isBlocked, "Blocked spots must be managed in the app.", 409, "conflict");
      const now = new Date();
      const actor = `API: ${key.name}`;
      let patch = {...body};
      let moved = false;
      let dayLock = null;
      if (kind === "create" || kind === "request" || (kind === "update" &&
        ["date", "time", "numberOfPeople"].some(field => Object.hasOwn(body, field)))) {
        const date = body.date || before.date;
        dateValue(date);
        if (kind !== "request") {
          dayLock = db.collection("integrationApiDays").doc(date);
          await tx.get(dayLock);
        }
        const day = await dayData(date, tx);
        const slots = slotsForDate(date, day.config);
        let time = body.time;
        if (!time) {
          // Keep the displayed clock time when moving to another date/season.
          const oldConfig = date !== before.date ? (await tx.get(db.doc(`timeOverrides/${before.date}`))).data() || {} :
            day.config;
          const oldSlot = slotsForDate(before.date, oldConfig).find(slot => slot.timeIndex === before.timeIndex);
          check(oldSlot, "Specify time because the old departure no longer exists.", 409, "conflict");
          time = oldSlot.time;
        }
        const matching = slots.filter(slot => slot.time === time);
        check(matching.length === 1, "Choose an unambiguous scheduled departure time.");
        const slot = matching[0];
        check(isFuture(date, time), "Choose a future departure in Switzerland.");
        const count = body.numberOfPeople || before.numberOfPeople;
        if (kind !== "request") {
          const available = availability(date, day.config, day.records, day.bookings, day.profiles, id)
              .find(item => item.timeIndex === slot.timeIndex);
          check(count <= available.availableSpots,
              "Not enough confirmed available spaces. On-request pilots must consent and be marked available " +
              "in Twin before their spaces can be booked through the API.", 409, "capacity_conflict");
          const assigned = before.assignedPilots || [];
          check(!assigned.slice(count).some(Boolean), "Unassign excess pilots in the app before reducing passengers.",
              409, "assignment_conflict");
          moved = !!id && (date !== before.date || slot.timeIndex !== before.timeIndex);
          if (moved) {
            for (const name of assigned.filter(Boolean)) {
              const pilot = day.profiles.find(profile => profile.displayName === name);
              const signedIn = pilot && day.records.some(record => record.userId === pilot.id &&
                record.status !== "unavailable" && record.status !== "onRequest" &&
                safeTime(record.timeSlot) === slot.lookupTime);
              const occupied = day.bookings.some(booking => booking.id !== id && booking.bookingStatus !== "deleted" &&
                booking.timeIndex === slot.timeIndex && (booking.assignedPilots || []).includes(name));
              check(signedIn && !occupied, `Assigned pilot ${name} is unavailable at this departure.`,
                  409, "assignment_conflict");
            }
          }
          patch = {...patch, date, timeIndex: slot.timeIndex, numberOfPeople: count, span: count};
          // Resizing keeps every retained pilot position and never discards an assigned pilot.
          if (id && count !== before.numberOfPeople) {
            patch.assignedPilots = Array.from({length: count}, (_, i) => assigned[i] || "");
          }
        } else {
          patch = {...patch, date, timeIndex: slot.timeIndex, time};
        }
      }
      if (kind !== "request") delete patch.time;
      if (kind === "create") {
        patch = {...patch, bookingStatus: patch.bookingStatus || "unconfirmed",
          bookingSource: patch.bookingSource || actor,
          assignedPilots: Array(body.numberOfPeople).fill(""), pilotIndex: 0, createdBy: key.createdBy,
          createdByName: actor, createdAt: now};
      } else if (kind === "request") {
        const {phoneNumber, pickupLocation, preferredContact, ...requestFields} = patch;
        // Match the existing form schema and its existing pending-request notification trigger.
        patch = {...requestFields, phone: phoneNumber || "", meetingPoint: pickupLocation || "",
          status: "pending", bookingSource: patch.bookingSource || actor, createdAt: now, apiKeyId: key.id};
        void preferredContact;
      } else if (kind === "delete") {
        patch = {bookingStatus: "deleted", assignedPilots: [], acknowledgedPilots: [], pilotPayments: [],
          deletedAt: now, deletedBy: key.createdBy, deletedByName: actor};
      } else if (moved) {
        patch.createdAt = now;
      }
      if (kind !== "request" && !(kind === "delete" && before.bookingStatus === "deleted")) {
        const {history, ...snapshotAfter} = {...before, ...patch};
        void history;
        const action = kind === "create" ? "created" : kind === "delete" ? "deleted" : moved ? "moved" :
          Object.keys(body).length === 1 && body.bookingStatus ? "status_changed" : "edited";
        const entry = {action, timestamp: now, userId: key.createdBy, userName: actor, apiKeyId: key.id,
          details: `${action} via API key ${key.name}`, snapshotAfter};
        patch.history = kind === "create" ? [entry] : FieldValue.arrayUnion(entry);
      }
      const response = {status: kind === "create" || kind === "request" ? 201 : 200,
        body: {id: ref.id, ...(kind === "request" ? {status: "pending"} :
          {bookingStatus: patch.bookingStatus || before.bookingStatus})}};
      if (dayLock) tx.set(dayLock, {updatedAt: now});
      if (id) {
        if (!(kind === "delete" && before.bookingStatus === "deleted")) tx.update(ref, patch);
      } else tx.create(ref, patch);
      tx.create(receiptRef, {fingerprint, response, apiKeyId: key.id, createdAt: now});
      return response;
    });
  }
  return {createKey, listKeys, revokeKey, authenticate, getAvailability, listBookings, getBooking, mutate};
}
function createBookingApiApp(service) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  // Server integrations only: keys must never be embedded in public web pages.
  app.use(async (req, res, next) => {
    try { req.apiKey = await service.authenticate(req.get("authorization")); next(); } catch (error) { next(error); }
  });
  app.use(express.json({limit: "32kb", strict: true}));
  const router = express.Router();
  router.get("/availability", async (req, res) => {
    requireScope(req.apiKey, "availability:read");
    res.json(await service.getAvailability(req.query));
  });
  router.get("/bookings", async (req, res) => {
    requireScope(req.apiKey, "bookings:read");
    res.json(await service.listBookings(req.query));
  });
  router.get("/bookings/:id", async (req, res) => {
    requireScope(req.apiKey, "bookings:read");
    res.json(await service.getBooking(req.params.id));
  });
  for (const [method, path, kind] of [["post", "/bookings", "create"], ["patch", "/bookings/:id", "update"],
    ["delete", "/bookings/:id", "delete"], ["post", "/booking-requests", "request"]]) {
    router[method](path, async (req, res) => {
      const result = await service.mutate(req.apiKey, kind, req.params.id, req.body, req.get("Idempotency-Key"));
      res.status(result.status).json(result.body);
    });
  }
  router.post("/mcp", createMcpHandler(service));
  router.all("/mcp", (req, res) => res.set("Allow", "POST").status(405).json({error: {code: "method_not_allowed",
    message: "Use POST for MCP requests."}}));
  app.use("/api/v1", router);
  app.use((req, res) => res.status(404).json({error: {code: "not_found", message: "Endpoint not found."}}));
  app.use((error, req, res, next) => {
    void next;
    const status = error instanceof ApiError ? error.status : error.type === "entity.too.large" ? 413 :
      error.type === "entity.parse.failed" ? 400 : 500;
    if (status === 429) res.set("Retry-After", "60");
    if (status === 500) console.error("Booking API request failed", {code: error.code || "internal"});
    res.status(status).json({error: {code: error instanceof ApiError ? error.code : "request_failed",
      message: status === 500 ? "Request failed. Retry with the same Idempotency-Key." :
        status === 413 ? "Request body is too large." : status === 400 && !(error instanceof ApiError) ?
          "Invalid JSON body." : error.message}});
  });
  return app;
}
function createBookingApiFunctions(db) {
  const service = createBookingApiService(db);
  const callable = fn => onCall({region: "us-central1"}, async request => {
    try { return await fn(request.auth, request.data); } catch (error) {
      if (error instanceof ApiError) {
        throw new HttpsError({400: "invalid-argument", 403: "permission-denied", 404: "not-found"}[error.status] ||
          "internal", error.message);
      }
      throw new HttpsError("internal", "Unable to manage API keys. Please try again.");
    }
  });
  return {bookingApi: onRequest({region: "us-central1"}, createBookingApiApp(service)),
    createIntegrationApiKey: callable(service.createKey), listIntegrationApiKeys: callable(service.listKeys),
    revokeIntegrationApiKey: callable(service.revokeKey)};
}
module.exports = {createBookingApiService, createBookingApiApp, createBookingApiFunctions};
