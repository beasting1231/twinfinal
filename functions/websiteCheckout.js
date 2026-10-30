const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {availability, dateValue, isFuture, slotsForDate} = require("./bookingApiDomain");
const {activeBookings, isFarFuture} = require("./websiteAvailability");
const {flightPrices} = require("./websiteBookingTicket");

// Prepaid website checkouts (twinn-react-app functions/api/checkouts.ts).
//
// While the customer is paying, their seats are held on the daily plan by a placeholder
// booking ("paymentHold"), so nobody else can take them. The SumUp checkout itself expires
// after PAYMENT_WINDOW_MS (the website sets `valid_until`). Paid → websiteBookingTicket.js turns
// the hold into the prepaid booking. Unpaid → releaseWebsiteCheckoutHolds removes it.

const sumupSecretKey = defineSecret("SUMUP_SECRET_KEY");
const PAYMENT_WINDOW_MS = 2 * 60 * 1000;
// A payment submitted right at the deadline still needs a moment to be confirmed.
const RELEASE_GRACE_MS = 30 * 1000;

class HoldError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validate(body) {
  const input = body && typeof body === "object" ? body : {};
  const record = {
    paymentReference: text(input.reference, 36),
    sumupCheckoutId: text(input.checkoutId, 36),
    customerName: text(input.customerName, 120),
    email: text(input.email, 254).toLowerCase(),
    phone: text(input.phone, 40),
    phoneCountryCode: text(input.phoneCountryCode, 8),
    date: text(input.date, 10),
    time: text(input.time, 5),
    numberOfPeople: Number(input.numberOfPeople),
    flightType: text(input.flightType, 20),
    notes: text(input.notes, 1500),
    abVariant: text(input.abVariant, 8),
    abVariantName: text(input.abVariantName, 60),
  };
  const valid = /^[0-9a-f-]{36}$/i.test(record.paymentReference) &&
    /^[0-9a-f-]{36}$/i.test(record.sumupCheckoutId) &&
    record.customerName.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) &&
    /^\d{1,2}:\d{2}$/.test(record.time) && Number.isInteger(record.numberOfPeople) &&
    record.numberOfPeople >= 1 && record.numberOfPeople <= 20 && flightPrices[record.flightType];
  if (!valid) throw new HoldError(400, "Please check your booking details and try again.");
  try {
    dateValue(record.date);
  } catch {
    throw new HoldError(400, "Please check your booking details and try again.");
  }
  return {...record, amount: flightPrices[record.flightType] * record.numberOfPeople, currency: "CHF"};
}

function createWebsiteCheckout({db, getSumupKey, fetchImpl = fetch, confirmCheckout}) {
  async function fetchCheckout(checkoutId) {
    const response = await fetchImpl(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: {Authorization: `Bearer ${getSumupKey()}`},
    });
    if (!response.ok) throw new Error(`SumUp checkout lookup failed with ${response.status}`);
    return response.json();
  }

  // Only real, unpaid SumUp checkouts for the right amount can hold seats.
  async function hold(body, now = Date.now()) {
    const record = validate(body);
    const checkout = await fetchCheckout(record.sumupCheckoutId);
    if (checkout.status !== "PENDING" || checkout.checkout_reference !== record.paymentReference ||
      Number(checkout.amount) !== record.amount) {
      throw new HoldError(400, "This payment can’t be started. Please try again.");
    }

    const checkoutRef = db.collection("websiteCheckouts").doc(record.paymentReference);
    const holdRef = db.collection("bookings").doc();
    const dayLock = db.collection("integrationApiDays").doc(record.date);
    const holdExpiresAt = now + PAYMENT_WINDOW_MS;

    await db.runTransaction(async (tx) => {
      // Same day lock as the booking API, so concurrent bookings for a date can't oversell.
      const [existing, , config, records, bookings, profiles] = await Promise.all([
        tx.get(checkoutRef),
        tx.get(dayLock),
        tx.get(db.doc(`timeOverrides/${record.date}`)),
        tx.get(db.collection("availability").where("date", "==", record.date)),
        tx.get(db.collection("bookings").where("date", "==", record.date)),
        tx.get(db.collection("userProfiles")),
      ]);
      if (existing.exists) throw new HoldError(409, "This payment was already started.");
      const rows = (snapshot) => snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
      const dayConfig = config.data() || {};
      const slot = slotsForDate(record.date, dayConfig)
          .find((item) => item.time.replace(/^0/, "") === record.time.replace(/^0/, ""));
      if (!slot || !isFuture(record.date, slot.time)) {
        throw new HoldError(409, "This departure is no longer available. Please pick another time.");
      }
      if (!isFarFuture(record.date)) {
        const free = availability(record.date, dayConfig, rows(records), activeBookings(rows(bookings), now),
            rows(profiles)).find((item) => item.timeIndex === slot.timeIndex).availableSpots;
        if (free < record.numberOfPeople) {
          throw new HoldError(409, free ?
            `Only ${free} ${free === 1 ? "spot is" : "spots are"} left at ${record.time}. Please pick another time or fewer flyers.` :
            "This departure just filled up. Please pick another time.", {availableSpots: free});
        }
      }

      const createdAt = new Date(now);
      tx.create(checkoutRef, {...record, timeIndex: slot.timeIndex, paymentStatus: "awaiting payment",
        holdBookingId: holdRef.id, holdExpiresAt, createdAt});
      tx.create(holdRef, {
        date: record.date,
        pilotIndex: 0,
        timeIndex: slot.timeIndex,
        customerName: `Paying online: ${record.customerName}`,
        numberOfPeople: record.numberOfPeople,
        pickupLocation: "HW",
        bookingSource: "New Website",
        notes: "Held while the customer pays on the website. Released automatically if unpaid.",
        flightType: record.flightType,
        assignedPilots: [],
        bookingStatus: "pending",
        span: record.numberOfPeople,
        paymentHold: true,
        paymentReference: record.paymentReference,
        holdExpiresAt,
        createdByName: "Website (payment hold)",
        createdAt,
      });
      tx.set(dayLock, {updatedAt: createdAt});
    });
    return {holdExpiresAt};
  }

  async function handleHold(req, res) {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed."});
      return;
    }
    try {
      res.json(await hold(req.body));
    } catch (error) {
      if (error instanceof HoldError) {
        res.status(error.status).json({error: error.message, ...error.extra});
        return;
      }
      console.error("Website checkout hold failed", {message: error.message});
      res.status(500).json({error: "We couldn’t start the payment. Please try again."});
    }
  }

  // Runs every minute: expired holds are confirmed if SumUp says paid, otherwise removed.
  async function releaseExpired(now = Date.now()) {
    const holds = await db.collection("bookings").where("paymentHold", "==", true).get();
    for (const holdDoc of holds.docs) {
      const {holdExpiresAt, paymentReference} = holdDoc.data();
      if (holdExpiresAt >= now - RELEASE_GRACE_MS) continue;
      try {
        const checkoutDoc = await db.collection("websiteCheckouts").doc(paymentReference).get();
        const status = checkoutDoc.exists ? (await fetchCheckout(checkoutDoc.data().sumupCheckoutId)).status : null;
        if (status === "PAID") {
          await confirmCheckout(checkoutDoc);
          continue;
        }
        await holdDoc.ref.delete();
        if (checkoutDoc.exists) await checkoutDoc.ref.update({paymentStatus: "expired", releasedAt: now});
      } catch (error) {
        console.error("Releasing payment hold failed", {holdId: holdDoc.id, message: error.message});
      }
    }
  }

  return {hold, handleHold, releaseExpired};
}

function createWebsiteCheckoutFunctions({db, confirmCheckout}) {
  const service = createWebsiteCheckout({db, confirmCheckout, getSumupKey: () => sumupSecretKey.value()});
  const options = {region: "us-central1", secrets: [sumupSecretKey]};
  return {
    holdWebsiteCheckout: onRequest({...options, invoker: "public", maxInstances: 10, timeoutSeconds: 30},
        service.handleHold),
    releaseWebsiteCheckoutHolds: onSchedule({...options, schedule: "every 1 minutes", timeZone: "Europe/Zurich"},
        () => service.releaseExpired()),
  };
}

module.exports = {createWebsiteCheckout, createWebsiteCheckoutFunctions, PAYMENT_WINDOW_MS};
