const {createHash} = require("crypto");
const {onDocumentWrittenWithAuthContext} = require("firebase-functions/v2/firestore");
const {Timestamp} = require("firebase-admin/firestore");

// This observer never writes availability, bookings, profiles, or payments.
// Keep it independent of the client save path, including older clients.
function snapshotState(snapshot) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  return {
    status: data.status === "unavailable" ? "unavailable" : data.status === "onRequest" ? "onRequest" : "available",
    timeSlot: data.timeSlot || "",
    signedInAt: data.signedInAt || null,
    signedOutAt: data.signedOutAt || null,
  };
}

function identity(snapshot) {
  const data = snapshot.exists ? snapshot.data() : null;
  if (!data || typeof data.userId !== "string" || typeof data.date !== "string" ||
      !data.userId || data.userId.includes("/") || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  return {userId: data.userId, date: data.date};
}

function createAvailabilityHistoryHandler(db) {
  return async (event) => {
    if (!event.data) return;
    const {before, after} = event.data;
    const beforeIdentity = identity(before);
    const afterIdentity = identity(after);
    const destinations = new Map();
    [beforeIdentity, afterIdentity].filter(Boolean).forEach((value) => {
      destinations.set(`${value.date}/${value.userId}`, value);
    });
    // Firestore may retry or deliver events out of order. Use the source event
    // identity for deduplication and the database commit time for ordering.
    const eventId = createHash("sha256").update(event.id).digest("hex");
    const fractionalSeconds = (event.time || "").match(/\.(\d+)Z$/);
    const committedAt = after.exists ? after.updateTime : new Timestamp(
        Math.floor(new Date(event.time).getTime() / 1000),
        fractionalSeconds ? Number(fractionalSeconds[1].padEnd(9, "0").slice(0, 9)) : 0,
    );
    for (const destination of destinations.values()) {
      const belongsTo = (value) => value && value.userId === destination.userId && value.date === destination.date;
      const entry = {
        schemaVersion: 1,
        sourceRecordId: event.params.availabilityId,
        before: belongsTo(beforeIdentity) ? snapshotState(before) : null,
        after: belongsTo(afterIdentity) ? snapshotState(after) : null,
        beforeVersion: belongsTo(beforeIdentity) ? before.updateTime : null,
        afterVersion: belongsTo(afterIdentity) ? after.updateTime : null,
        committedAt,
        actorId: event.authId || null,
        actorType: event.authType || "unknown",
      };
      const ref = db.collection("availabilityHistory").doc(destination.date)
          .collection("pilots").doc(destination.userId).collection("events").doc(eventId);
      try {
        await ref.create(entry);
      } catch (error) {
        if (error.code !== 6 && error.code !== "already-exists") throw error;
      }
    }
  };
}

function createAvailabilityHistoryFunction(db) {
  return onDocumentWrittenWithAuthContext(
      {document: "availability/{availabilityId}", retry: true},
      createAvailabilityHistoryHandler(db),
  );
}

module.exports = {createAvailabilityHistoryHandler, createAvailabilityHistoryFunction};
