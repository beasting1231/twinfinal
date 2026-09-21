const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineString} = require("firebase-functions/params");
const {createHash} = require("crypto");

const voucherRecipient = defineString("WEBSITE_VOUCHER_RECIPIENT", {
  default: "bookings@twinparagliding.com",
});
const sender = "bookings@twinparagliding.com";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]));
}

function renderEmail(kind, rows) {
  const values = Object.fromEntries(rows);
  const title = kind === "contact" ? "Contact request" : "Gift voucher request";
  const format = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");
  const section = (heading, items) => {
    const content = items.filter(([, value]) => value).map(([label, value]) => label ? `
      <tr><td width="32%" valign="top" style="padding:0 16px 12px 0;
        font-size:13px;line-height:22px;color:#737373;">${escapeHtml(label)}</td>
      <td valign="top" style="padding:0 0 12px;font-size:15px;line-height:22px;
        color:#202020;word-break:break-word;overflow-wrap:anywhere;">${format(value)}</td></tr>` : `
      <tr><td style="padding:0 0 16px;font-size:15px;line-height:24px;
        color:#202020;word-break:break-word;overflow-wrap:anywhere;">${format(value)}</td></tr>`).join("");
    if (!content) return "";
    return `<tr><td style="padding:24px 0 8px;border-top:1px solid #e8e8e8;">
      <h2 style="margin:0 0 20px;font-size:12px;line-height:18px;font-weight:600;
        letter-spacing:1px;text-transform:uppercase;color:#737373;">${escapeHtml(heading)}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border-collapse:collapse;table-layout:fixed;">${content}</table>
    </td></tr>`;
  };
  let sections;
  if (kind === "contact") {
    sections = section("From", [["Name", values.Name], ["Email", values.Email]]) +
      section("Message", [["", values.Message]]);
  } else {
    const flight = values.Flight.charAt(0).toUpperCase() + values.Flight.slice(1);
    sections = section("Voucher", [
      ["Flight", `The ${flight}`], ["For", values["Voucher recipient"]],
      ["Photo & video", values["Photo & video"] === "yes" ? "Included · CHF 40" : "Not included"],
      ["Transport", values.Transport === "yes" ? "Included · CHF 30" : "Not included"],
      ["Delivery", values.Delivery === "pdf" ? "PDF by email" : "Post within Switzerland"],
    ]) + `<tr><td style="padding:18px 0 24px;border-top:1px solid #e8e8e8;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:14px;color:#737373;">Total</td>
        <td align="right" style="font-size:24px;font-weight:600;color:#202020;">${escapeHtml(values.Total)}</td>
      </tr></table></td></tr>` + section("Customer & billing", [
      ["Name", `${values["First name"]} ${values["Last name"]}`],
      ["Email", values.Email], ["Phone", values.Phone], ["Business", values.Business],
      ["Address", `${values.Street}\n${values["Post code"]} ${values.City}`],
    ]) + section("Additional comments", [["", values.Comments]]);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#202020;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="max-width:560px;border-collapse:collapse;table-layout:fixed;">
<tr><td style="padding:0 0 28px;">
  <h1 style="margin:0;font-size:26px;line-height:34px;letter-spacing:-0.5px;font-weight:600;">${title}</h1>
</td></tr>
${sections}
</table></td></tr></table></body></html>`;
}

function buildMessage(kind, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpsError("invalid-argument", "Please complete the form.");
  }
  const fields = {};
  const field = (key, max = 200, required = true) => {
    const value = input[key] === undefined ? "" : input[key];
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
      throw new HttpsError("invalid-argument", `Please check ${key}.`);
    }
    fields[key] = value.trim();
    return fields[key];
  };
  const email = field("email", 254);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Please enter a valid email address.");
  }
  if (field("website", 200, false)) {
    throw new HttpsError("invalid-argument", "Unable to submit this form.");
  }
  let subject;
  let rows;
  if (kind === "contact") {
    subject = "[Website] Contact request";
    rows = [["Name", field("name")], ["Email", email], ["Message", field("message", 5000)]];
  } else {
    const choice = (key, options) => {
      const value = field(key);
      if (!options.includes(value)) throw new HttpsError("invalid-argument", `Please check ${key}.`);
      return value;
    };
    const flight = choice("flight", ["sensational", "classic", "spectacular", "romantic"]);
    const photoVideo = choice("photoVideo", ["yes", "no"]);
    const transport = choice("transport", ["yes", "no"]);
    if (transport === "yes" && !["spectacular", "romantic"].includes(flight)) {
      throw new HttpsError("invalid-argument", "Transport is not available for this flight.");
    }
    const total = {sensational: 180, classic: 170, spectacular: 210, romantic: 210}[flight] +
      (photoVideo === "yes" ? 40 : 0) + (transport === "yes" ? 30 : 0);
    subject = "[Website] Gift voucher request";
    rows = [
      ["First name", field("firstName")], ["Last name", field("lastName")],
      ["Email", email], ["Phone", field("phone", 80)],
      ["Voucher recipient", field("recipientName", 200, false)],
      ["Delivery", choice("deliveryMethod", ["pdf", "post"])],
      ["Street", field("street", 300)], ["Post code", field("postCode", 30)], ["City", field("city")],
      ["Business", field("businessName", 200, false)], ["Flight", flight],
      ["Photo & video", photoVideo], ["Transport", transport], ["Total", `CHF ${total}`],
      ["Comments", field("comments", 5000, false)],
    ];
  }
  return {
    fields, subject, replyTo: email,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n\n"),
    html: renderEmail(kind, rows),
  };
}

function createHandler(kind, {db, transporter, getVoucherRecipient = () => voucherRecipient.value()}) {
  return async (request) => {
    const message = buildMessage(kind, request.data);
    const to = kind === "voucher" ? getVoucherRecipient() : sender;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
      throw new HttpsError("internal", "The email recipient is not configured.");
    }
    const now = Date.now();
    // Identical submissions are deduplicated for ten minutes, including a lost response/retry.
    const fingerprint = hash(JSON.stringify([kind, message.fields]));
    const record = db.collection("websiteFormRequests").doc(fingerprint);
    const rate = db.collection("websiteFormRateLimits").doc(hash(request.rawRequest.ip || "unknown"));
    const alreadySent = await db.runTransaction(async (tx) => {
      const previous = await tx.get(record);
      const rateDoc = await tx.get(rate);
      const prior = previous.exists ? previous.data() : {};
      if (prior.createdAt > now - 10 * 60 * 1000) {
        if (prior.status === "sent") return true;
        // Do not automatically resend after an ambiguous SMTP failure.
        throw new HttpsError("failed-precondition", "Your request is already recorded. Please contact us directly.");
      }
      const recent = rateDoc.exists ? rateDoc.data() : {};
      const count = recent.windowStart > now - 60 * 60 * 1000 ? recent.count : 0;
      if (count >= 5) throw new HttpsError("resource-exhausted", "Too many requests. Please try again later.");
      tx.set(rate, {windowStart: count ? recent.windowStart : now, count: count + 1});
      tx.set(record, {kind, fields: message.fields, to, status: "sending", createdAt: now});
      return false;
    });
    if (alreadySent) return {sent: true};
    try {
      const result = await transporter.sendMail({
        from: {name: "Twin Paragliding", address: sender},
        to, replyTo: message.replyTo, subject: message.subject, text: message.text, html: message.html,
      });
      if (!result.accepted || result.accepted.length === 0) throw new Error("Recipient not accepted");
    } catch (error) {
      console.error("Website form email failed", {kind, code: error.code || "SMTP_FAILURE"});
      await record.update({status: "failed", failedAt: Date.now()});
      throw new HttpsError("unavailable", "We couldn’t send your request. Please email bookings@twinparagliding.com.");
    }
    await record.update({status: "sent", sentAt: Date.now()});
    return {sent: true};
  };
}

function createWebsiteForms(dependencies) {
  const options = {region: "us-central1", invoker: "public", timeoutSeconds: 60, maxInstances: 3};
  return {
    submitWebsiteContact: onCall(options, createHandler("contact", dependencies)),
    submitWebsiteVoucherRequest: onCall(options, createHandler("voucher", dependencies)),
  };
}

module.exports = {createWebsiteForms, createHandler, buildMessage};
