const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const QRCode = require("qrcode");

// Prepaid website bookings: once SumUp reports a checkout as PAID, put the
// booking on the schedule as prepaid and email the customer their ticket (once).
// Triggered by the website after the customer returns from SumUp, and by the
// SumUp webhook in case the customer never returns. Neither trusts the caller:
// the payment status is always re-read from the SumUp API.

const sumupSecretKey = defineSecret("SUMUP_SECRET_KEY");
const sender = "bookings@twinparagliding.com";
const SENDING_LOCK_MS = 5 * 60 * 1000;

const flightNames = {
  "classic": "The Classic",
  "sensational": "The Sensational",
  "early bird": "The Early Bird",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]));
}

function formatDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return String(dateKey);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function ticketSummary(bookingId, booking) {
  return {
    bookingId,
    customerName: booking.customerName,
    flightName: flightNames[booking.flightType] || "Tandem flight",
    date: booking.date,
    time: booking.time,
    passengers: booking.numberOfPeople,
    amount: booking.amount,
  };
}

function renderTicketEmail(ticket) {
  const detail = (label, value) => `
    <td valign="top" width="33%" style="padding:0 12px 18px 0;">
      <div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#8a8a84;">${escapeHtml(label)}</div>
      <div style="font-size:15px;line-height:22px;font-weight:700;color:#f3f3ef;">${escapeHtml(value)}</div>
    </td>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Twin Paragliding ticket</title></head>
<body style="margin:0;padding:0;background:#f1f1ed;color:#11110f;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ed;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
<tr><td style="padding:0 0 12px;font-size:32px;line-height:36px;font-weight:900;text-transform:uppercase;letter-spacing:-1px;">Your ticket</td></tr>
<tr><td style="padding:0 0 24px;font-size:15px;line-height:23px;color:#4a4a45;">
  Thank you for booking with us <strong style="color:#11110f;">${escapeHtml(ticket.customerName)}</strong>
</td></tr>
<tr><td style="background:#11110f;border-radius:12px 12px 0 0;padding:26px 26px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="right" style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#8a8a84;">Tandem flight · Interlaken</td>
    </tr>
    <tr><td style="padding:20px 0 20px;font-size:30px;line-height:32px;font-weight:900;text-transform:uppercase;letter-spacing:-1px;color:#f3f3ef;border-bottom:1px solid #33332f;">${escapeHtml(ticket.flightName)}</td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;table-layout:fixed;">
    <tr>${detail("Date", formatDate(ticket.date))}${detail("Time", ticket.time)}${detail("Flyers", ticket.passengers)}</tr>
    <tr>${detail("Name", ticket.customerName)}${detail("Meeting point", "Interlaken")}${detail("Paid", `CHF ${ticket.amount}`)}</tr>
  </table>
</td></tr>
<tr><td style="background:#11110f;border-top:2px dashed #3d3d38;border-radius:0 0 12px 12px;padding:26px;" align="center">
  <img src="cid:ticket-qr" width="180" height="180" alt="Booking QR code" style="display:block;width:180px;height:180px;border:0;border-radius:8px;background:#ffffff;">
  <div style="padding-top:14px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8a84;">Booking ID</div>
  <div style="padding-top:4px;font-family:Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#f3f3ef;">${escapeHtml(ticket.bookingId)}</div>
</td></tr>
<tr><td style="padding:24px 0 0;font-size:13px;line-height:21px;color:#4a4a45;">
  If you have any questions, reply to this email or send us a message on WhatsApp at
  <a href="https://wa.me/41796225100" style="color:#11110f;font-weight:700;text-decoration:underline;">+41 79 622 51 00</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}

function renderTicketText(ticket) {
  return [
    "Your ticket",
    "",
    `Thank you for booking with us ${ticket.customerName}`,
    "",
    `Flight: ${ticket.flightName}`,
    `Date: ${formatDate(ticket.date)}`,
    `Time: ${ticket.time}`,
    `Flyers: ${ticket.passengers}`,
    "Meeting point: Interlaken",
    `Paid: CHF ${ticket.amount}`,
    `Booking ID: ${ticket.bookingId}`,
    "",
    "If you have any questions, reply to this email or send us a message on WhatsApp at +41 79 622 51 00 (https://wa.me/41796225100).",
  ].join("\n");
}

// Keep in sync with the flight prices on the website (twinn-react-app functions/api/checkouts.ts).
const flightPrices = {"classic": 170, "sensational": 180, "early bird": 180};

function createTicketService({db, transporter, getSumupKey, fetchImpl = fetch, notifyTeam = async () => {}}) {
  async function fetchCheckout(checkoutId) {
    const response = await fetchImpl(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: {Authorization: `Bearer ${getSumupKey()}`},
    });
    if (!response.ok) throw new Error(`SumUp checkout lookup failed with ${response.status}`);
    return response.json();
  }

  async function findOne(collection, field, value) {
    const snapshot = await db.collection(collection).where(field, "==", value).limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0];
  }

  // Re-reads SumUp; never trusts the caller.
  async function isPaid(record) {
    if (record.paymentStatus === "paid") return true;
    if (!record.sumupCheckoutId) return false;
    const checkout = await fetchCheckout(record.sumupCheckoutId);
    return checkout.status === "PAID" &&
      checkout.checkout_reference === record.paymentReference &&
      Number(checkout.amount) === Number(record.amount);
  }

  // Emails the ticket at most once. `update` is applied to `ref` in the same transaction.
  async function sendTicketOnce(ref, ticket, email, update = {}) {
    const shouldSend = await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      const lockedUntil = (current.ticketEmailStartedAt || 0) + SENDING_LOCK_MS;
      if (current.ticketEmailStatus === "sent" || (current.ticketEmailStatus === "sending" && lockedUntil > Date.now())) {
        if (Object.keys(update).length) tx.update(ref, update);
        return false;
      }
      tx.update(ref, {...update, ticketEmailStatus: "sending", ticketEmailStartedAt: Date.now()});
      return true;
    });
    if (!shouldSend) return;

    try {
      const qrPng = await QRCode.toBuffer(ticket.bookingId, {
        type: "png", width: 360, margin: 2, errorCorrectionLevel: "Q",
        color: {dark: "#11110f", light: "#ffffff"},
      });
      const result = await transporter.sendMail({
        from: {name: "Twin Paragliding", address: sender},
        to: email,
        replyTo: sender,
        subject: `Your ticket · ${ticket.flightName} · ${formatDate(ticket.date)}, ${ticket.time}`,
        text: renderTicketText(ticket),
        html: renderTicketEmail(ticket),
        attachments: [{filename: "ticket-qr.png", content: qrPng, cid: "ticket-qr"}],
      });
      if (!result.accepted || result.accepted.length === 0) throw new Error("Recipient not accepted");
      await ref.update({ticketEmailStatus: "sent", ticketEmailSentAt: Date.now()});
    } catch (error) {
      console.error("Ticket email failed", {bookingId: ticket.bookingId, code: error.code || error.message});
      await ref.update({ticketEmailStatus: "failed", ticketEmailFailedAt: Date.now()});
    }
  }

  // Prepaid checkout (websiteCheckouts/{reference}): nothing reaches the schedule until SumUp
  // reports it paid. Then it becomes a confirmed, prepaid booking — once — and the team is told.
  async function confirmCheckout(checkoutDoc) {
    const record = checkoutDoc.data();
    if (!(await isPaid(record))) return {paid: false};
    if (Number(record.amount) !== (flightPrices[record.flightType] || 0) * record.numberOfPeople) {
      console.error("Prepaid checkout amount mismatch", {reference: checkoutDoc.id});
      return {paid: false};
    }

    const newBookingRef = db.collection("bookings").doc();
    const holdRef = record.holdBookingId ? db.collection("bookings").doc(record.holdBookingId) : null;
    const created = await db.runTransaction(async (tx) => {
      const current = (await tx.get(checkoutDoc.ref)).data();
      if (current.bookingId) return null;
      // Replaces the placeholder that held the seats during payment, where the office may have moved it.
      const hold = holdRef ? await tx.get(holdRef) : null;
      const placed = hold && hold.exists && hold.data().paymentHold ? hold.data() : null;
      const now = new Date();
      const booking = {
        date: placed ? placed.date : record.date,
        pilotIndex: placed ? placed.pilotIndex : 0,
        timeIndex: placed ? placed.timeIndex : record.timeIndex,
        customerName: record.customerName,
        numberOfPeople: record.numberOfPeople,
        pickupLocation: "HW",
        bookingSource: "New Website",
        phoneNumber: record.phone || "",
        email: record.email,
        notes: record.notes || "",
        flightType: record.flightType,
        assignedPilots: [],
        bookingStatus: "confirmed",
        span: record.numberOfPeople,
        prepaid: true,
        paymentReference: record.paymentReference,
        amount: record.amount,
        createdByName: "Website (prepaid)",
        createdAt: now,
      };
      if (placed) tx.delete(holdRef);
      tx.create(newBookingRef, {...booking, history: [{
        action: "created", timestamp: now, userId: "website", userName: "Website (prepaid)",
        details: `Paid online: CHF ${record.amount}`, snapshotAfter: booking,
      }]});
      tx.update(checkoutDoc.ref, {paymentStatus: "paid", paidAt: Date.now(), bookingId: newBookingRef.id});
      return newBookingRef.id;
    });
    const bookingId = created || (await checkoutDoc.ref.get()).data().bookingId;
    if (created) {
      await notifyTeam({...record, bookingId}).catch((error) =>
        console.error("Prepaid booking notification failed", {bookingId, message: error.message}));
    }

    const ticket = ticketSummary(bookingId, record);
    await sendTicketOnce(checkoutDoc.ref, ticket, record.email);
    return {paid: true, ticket};
  }

  // Checkouts started before websiteCheckouts existed were saved as booking requests.
  async function confirmLegacyRequest(bookingDoc) {
    const booking = bookingDoc.data();
    if (booking.formId !== "website" || !(await isPaid(booking))) return {paid: false};
    const ticket = ticketSummary(bookingDoc.id, booking);
    const update = booking.paymentStatus === "paid" ? {} : {paymentStatus: "paid", paidAt: Date.now()};
    await sendTicketOnce(bookingDoc.ref, ticket, booking.email, update);
    return {paid: true, ticket};
  }

  // Website: called with the payment reference from the SumUp redirect URL.
  async function handleConfirmCall(request) {
    const reference = request.data && request.data.paymentReference;
    if (typeof reference !== "string" || !/^[0-9a-f-]{36}$/i.test(reference)) {
      throw new HttpsError("invalid-argument", "Invalid payment reference.");
    }
    const checkoutDoc = await db.collection("websiteCheckouts").doc(reference).get();
    let result;
    if (checkoutDoc.exists) {
      result = await confirmCheckout(checkoutDoc);
    } else {
      const bookingDoc = await findOne("bookingRequests", "paymentReference", reference);
      if (!bookingDoc) throw new HttpsError("not-found", "Booking not found.");
      result = await confirmLegacyRequest(bookingDoc);
    }
    return result.paid ? {paid: true, ticket: result.ticket} : {paid: false};
  }

  // SumUp webhook: payload only tells us which checkout changed.
  async function handleWebhook(req, res) {
    const checkoutId = req.body && req.body.id;
    if (req.method !== "POST" || typeof checkoutId !== "string" || !/^[0-9a-f-]{36}$/i.test(checkoutId)) {
      res.status(400).send("Bad request");
      return;
    }
    try {
      const checkoutDoc = await findOne("websiteCheckouts", "sumupCheckoutId", checkoutId);
      if (checkoutDoc) {
        await confirmCheckout(checkoutDoc);
      } else {
        const bookingDoc = await findOne("bookingRequests", "sumupCheckoutId", checkoutId);
        if (bookingDoc) await confirmLegacyRequest(bookingDoc);
      }
      res.status(200).send("OK");
    } catch (error) {
      console.error("SumUp webhook failed", {checkoutId, message: error.message});
      res.status(500).send("Error");
    }
  }

  return {confirmCheckout, confirmLegacyRequest, handleConfirmCall, handleWebhook};
}

function createWebsiteBookingTicketFunctions({db, transporter, notifyTeam}) {
  const service = createTicketService({db, transporter, notifyTeam, getSumupKey: () => sumupSecretKey.value()});
  const options = {region: "us-central1", secrets: [sumupSecretKey], timeoutSeconds: 60, maxInstances: 5};
  return {
    confirmCheckout: service.confirmCheckout,
    confirmWebsiteBookingPayment: onCall({...options, invoker: "public"}, service.handleConfirmCall),
    sumupWebhook: onRequest({...options, invoker: "public"}, service.handleWebhook),
  };
}

module.exports = {createWebsiteBookingTicketFunctions, createTicketService, renderTicketEmail, formatDate,
  flightPrices};
