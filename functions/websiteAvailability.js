const {onRequest} = require("firebase-functions/v2/https");
const {dateValue, availability} = require("./bookingApiDomain");

// Holds that ran out but weren't cleaned up yet don't take space (see websiteCheckout.js).
function activeBookings(bookings, now) {
  return bookings.filter((booking) => !(booking.paymentHold && booking.holdExpiresAt < now));
}

// Public free-spot counts for the website's prepaid booking flow (twinn-react-app,
// served via its /api/availability proxy). Returns counts only, never booking details.
//
// Customers paying right now hold their seats with a placeholder booking (websiteCheckout.js);
// expired placeholders are ignored. Older prepaid booking requests hold theirs until approved.

const CHECKOUT_HOLD_MS = 30 * 60 * 1000;
const UNRESTRICTED_MONTHS = 2;

function rows(snapshot) {
  return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return Number(value) || 0;
}

// Same rule as the booking form (BookingRequestForm.tsx): pilots don't enter
// availability that far ahead, so dates 2+ months out aren't restricted.
function isFarFuture(date, now = new Date()) {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() + UNRESTRICTED_MONTHS);
  return new Date(`${date}T12:00:00Z`) >= limit;
}

function heldRequests(requests, now = Date.now()) {
  return requests.filter((request) => request.formId === "website" &&
    request.status === "pending" && request.paymentReference &&
    (request.paymentStatus === "paid" ||
      (request.paymentStatus === "awaiting payment" && now - millis(request.createdAt) < CHECKOUT_HOLD_MS)))
      .map((request) => ({
        id: `request:${request.id}`,
        timeIndex: request.timeIndex,
        numberOfPeople: request.numberOfPeople,
        bookingStatus: "pending",
      }));
}

function createWebsiteAvailability(db) {
  async function getDay(date) {
    const [config, records, bookings, profiles, requests] = await Promise.all([
      db.doc(`timeOverrides/${date}`).get(),
      db.collection("availability").where("date", "==", date).get(),
      db.collection("bookings").where("date", "==", date).get(),
      db.collection("userProfiles").get(),
      db.collection("bookingRequests").where("date", "==", date).get(),
    ]);
    const unrestricted = isFarFuture(date);
    const slots = availability(date, config.data() || {}, rows(records),
        [...activeBookings(rows(bookings), Date.now()), ...heldRequests(rows(requests))], rows(profiles));
    return {
      date,
      timezone: "Europe/Zurich",
      slots: slots.map((slot) => ({
        time: slot.time,
        timeIndex: slot.timeIndex,
        // null = not restricted (far future).
        availableSpots: unrestricted ? null : slot.availableSpots,
        bookable: slot.bookable,
      })),
    };
  }

  return onRequest({region: "us-central1", invoker: "public", maxInstances: 10, timeoutSeconds: 20},
      async (req, res) => {
        res.set("Cache-Control", "no-store");
        if (req.method !== "GET") {
          res.status(405).json({error: "Method not allowed."});
          return;
        }
        let date;
        try {
          date = dateValue(req.query.date);
        } catch (error) {
          res.status(400).json({error: error.message});
          return;
        }
        try {
          res.json(await getDay(date));
        } catch (error) {
          console.error("Website availability failed", {date, message: error.message});
          res.status(500).json({error: "Availability is unavailable."});
        }
      });
}

module.exports = {createWebsiteAvailability, heldRequests, isFarFuture, activeBookings};
