const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const https = require("https");

admin.initializeApp();

const db = admin.firestore();

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  host: "asmtp.mail.hostpoint.ch",
  port: 465,
  secure: true, // SSL/TLS
  auth: {
    user: "bookings@twinparagliding.com",
    pass: "Fly-Twin0246",
  },
});

// HTML Email Template Function for Customer
function generateCustomerEmailHTML(bookingData) {
  const {
    customerName,
    email,
    phone,
    date,
    time,
    numberOfPeople,
    flightType,
    notes,
  } = bookingData;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Booking Request Confirmation</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f7f7f8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #111827;
      }
      .container {
        max-width: 600px;
        margin: 40px auto;
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        overflow: hidden;
      }
      .logo-section {
        text-align: center;
        padding: 32px 20px 20px 20px;
      }
      .logo-section img {
        height: 120px;
        width: auto;
      }
      .header {
        text-align: center;
        padding: 20px 20px 30px 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      .header h1 {
        font-size: 28px;
        font-weight: 700;
        margin: 0;
        color: #1f2937;
      }
      .content {
        padding: 32px;
      }
      .content p {
        margin: 0 0 16px 0;
        line-height: 1.6;
        color: #374151;
      }
      .details {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 20px;
        margin-top: 20px;
      }
      .details-row {
        display: flex;
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 0;
      }
      .details-row:last-child {
        border-bottom: none;
      }
      .label {
        width: 150px;
        font-weight: 600;
        color: #6b7280;
      }
      .value {
        flex: 1;
        color: #111827;
      }
      .badge {
        display: inline-block;
        background-color: #2563eb;
        color: #fff;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 13px;
        font-weight: 600;
        text-transform: capitalize;
      }
      .footer {
        text-align: center;
        padding: 24px;
        font-size: 13px;
        color: #6b7280;
        border-top: 1px solid #e5e7eb;
      }
      .footer a {
        color: #2563eb;
        text-decoration: none;
      }
      .whatsapp-button {
        display: inline-block;
        background-color: #25D366;
        color: #ffffff !important;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 600;
        border-radius: 8px;
        text-decoration: none;
        margin-top: 10px;
      }
      .qr {
        display: block;
        margin: 16px auto 0 auto;
        width: 120px;
        height: 120px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo-section">
        <img src="https://twinscheduler.web.app/logo.png" alt="Twin Paragliding Logo" />
      </div>
      <div class="header">
        <h1>Booking Request Received</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>Thanks for requesting a tandem flight with <strong>Twin Paragliding</strong>! We've logged your details and will review availability shortly. You'll receive a confirmation email once approved.</p>

        <div class="details">
          <div class="details-row"><div class="label">Name</div><div class="value">${customerName}</div></div>
          <div class="details-row"><div class="label">Email</div><div class="value">${email}</div></div>
          <div class="details-row"><div class="label">Phone</div><div class="value">${phone || "—"}</div></div>
          <div class="details-row"><div class="label">Date</div><div class="value">${new Date(date).toLocaleDateString("en-US", {weekday: "long", year: "numeric", month: "long", day: "numeric"})}</div></div>
          <div class="details-row"><div class="label">Time</div><div class="value">${time}</div></div>
          <div class="details-row"><div class="label">Number of People</div><div class="value">${numberOfPeople}</div></div>
          <div class="details-row"><div class="label">Flight Type</div><div class="value"><span class="badge">${flightType || "—"}</span></div></div>
          <div class="details-row"><div class="label">Notes</div><div class="value">${notes || "—"}</div></div>
        </div>

        <p style="margin-top:24px;">If this is a <strong>last-minute booking</strong>, it's best to contact us directly via WhatsApp using the button below or by scanning the QR code.</p>
        <div style="text-align:center;">
          <a href="https://wa.me/41796225100?text=${encodeURIComponent(`Hi! I just made a booking request under the name ${customerName}`)}" class="whatsapp-button">Message us on WhatsApp</a>
          <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`https://wa.me/41796225100?text=${encodeURIComponent(`Hi! I just made a booking request under the name ${customerName}`)}`)}&size=120x120" alt="WhatsApp QR Code" class="qr" />
        </div>

        <p style="margin-top:24px;">We look forward to flying with you!</p>
        <p><strong>— The Twin Paragliding Team</strong></p>
      </div>
      <div class="footer">
        <div><strong>Twin Paragliding</strong> — Experience the thrill of tandem paragliding</div>
        <div style="margin-top:8px;">📧 <a href="mailto:bookings@twinparagliding.com">bookings@twinparagliding.com</a> · 🌐 <a href="https://www.twinparagliding.com">www.twinparagliding.com</a></div>
      </div>
    </div>
  </body>
</html>
  `;
}

// HTML Email Template Function for Admin Notification
// Uses inline styles for better email client compatibility
function generateAdminEmailHTML(bookingData) {
  const {
    customerName,
    email,
    phone,
    date,
    time,
    numberOfPeople,
    flightType,
    notes,
  } = bookingData;

  // Extract just the phone number without country code prefix for WhatsApp
  const whatsappNumber = phone ? phone.replace(/\s/g, "").replace(/[^0-9+]/g, "") : "";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New Booking Request</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f7f7f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #111827;">
    <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); overflow: hidden;">
      <div style="text-align: center; padding: 32px 20px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #1f2937;">🔔 New Booking Request</h1>
      </div>
      <div style="padding: 32px;">
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Name</div><div style="flex: 1; color: #111827;">${customerName}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Email</div><div style="flex: 1; color: #111827;">${email}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Phone</div><div style="flex: 1; color: #111827;">${phone || "—"}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Date</div><div style="flex: 1; color: #111827;">${new Date(date).toLocaleDateString("en-US", {weekday: "long", year: "numeric", month: "long", day: "numeric"})}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Time</div><div style="flex: 1; color: #111827;">${time}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Number of People</div><div style="flex: 1; color: #111827;">${numberOfPeople}</div></div>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Flight Type</div><div style="flex: 1; color: #111827;"><span style="display: inline-block; background-color: #2563eb; color: #fff; border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 600; text-transform: capitalize;">${flightType || "—"}</span></div></div>
          <div style="display: flex; padding: 10px 0;"><div style="width: 150px; font-weight: 600; color: #6b7280;">Notes</div><div style="flex: 1; color: #111827;">${notes || "—"}</div></div>
        </div>

        ${phone ? `
        <div style="text-align: center;">
          <a href="https://wa.me/${whatsappNumber}" style="display: inline-block; background-color: #25D366; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; border-radius: 8px; text-decoration: none; text-align: center;">Contact Customer on WhatsApp</a>
        </div>
        ` : ""}
      </div>
    </div>
  </body>
</html>
  `;
}

// Function to send Telegram message with optional inline keyboard
function sendTelegramMessage(botToken, chatId, message, inlineKeyboard = null) {
  return new Promise((resolve, reject) => {
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    };

    if (inlineKeyboard) {
      payload.reply_markup = {
        inline_keyboard: inlineKeyboard,
      };
    }

    const data = JSON.stringify(payload);

    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`Telegram API error: ${responseData}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Generate Telegram message and buttons for booking notification
function generateTelegramNotification(bookingData) {
  const {
    customerName,
    email,
    phone,
    date,
    time,
    numberOfPeople,
    flightType,
    notes,
  } = bookingData;

  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Clean phone number for URLs and display (no spaces, keep + and digits)
  const cleanPhone = phone ?
    phone.replace(/\s/g, "").replace(/[^0-9+]/g, "") : null;

  const message = `🔔 *New Booking Request*

👤 *Name:* ${customerName}
📧 *Email:* ${email}
📞 *Phone:* ${cleanPhone || "—"}
📅 *Date:* ${formattedDate}
🕐 *Time:* ${time}
👥 *Guests:* ${numberOfPeople}
✈️ *Flight Type:* ${flightType || "—"}
📝 *Notes:* ${notes || "—"}`;

  // Build inline keyboard with contact buttons
  // Note: Telegram only supports http/https URLs, not tel: or mailto:
  const inlineKeyboard = [];

  // WhatsApp button (if phone exists)
  if (cleanPhone) {
    inlineKeyboard.push([
      {
        text: "💬 WhatsApp",
        url: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
            `Hi ${customerName}! This is Twin Paragliding regarding your booking request.`)}`,
      },
    ]);
  }

  return {message, inlineKeyboard};
}

// Cloud Function: Send email when a new booking request is created
exports.sendBookingConfirmationEmail = onDocumentCreated(
    "bookingRequests/{requestId}",
    async (event) => {
      const bookingData = event.data.data();

      // Fetch notification settings from Firestore
      let notificationConfig = {
        emailNotifications: {
          enabled: true,
          recipients: ["petervibecoding@gmail.com"], // Fallback default
        },
        telegramNotifications: {
          enabled: false,
          chatIds: [],
          botToken: "",
        },
      };

      try {
        const configDoc = await db.collection("settings")
            .doc("notifications").get();
        if (configDoc.exists) {
          const data = configDoc.data();
          notificationConfig = {
            emailNotifications: {
              enabled: data.emailNotifications?.enabled ?? true,
              recipients: data.emailNotifications?.recipients ?? [],
            },
            telegramNotifications: {
              enabled: data.telegramNotifications?.enabled ?? false,
              chatIds: data.telegramNotifications?.chatIds ?? [],
              botToken: data.telegramNotifications?.botToken ?? "",
            },
          };
        }
      } catch (error) {
        console.error("Error fetching notification config:", error);
      }

      // Generate HTML emails
      const customerHtmlContent = generateCustomerEmailHTML(bookingData);
      const adminHtmlContent = generateAdminEmailHTML(bookingData);

      const emailPromises = [];

      // Email options for customer (always send)
      const customerMailOptions = {
        from: {
          name: "Twin Paragliding",
          address: "bookings@twinparagliding.com",
        },
        to: bookingData.email,
        subject: "🪂 Booking request - Twin Paragliding",
        html: customerHtmlContent,
      };
      emailPromises.push(transporter.sendMail(customerMailOptions));

      // Send admin email notifications if enabled
      if (notificationConfig.emailNotifications.enabled &&
          notificationConfig.emailNotifications.recipients.length > 0) {
        const adminMailOptions = {
          from: {
            name: "Twin Paragliding",
            address: "bookings@twinparagliding.com",
          },
          to: notificationConfig.emailNotifications.recipients.join(", "),
          subject: "🔔 New Booking Request - Twin Paragliding",
          html: adminHtmlContent,
        };
        emailPromises.push(transporter.sendMail(adminMailOptions));
      }

      // Log notification config for debugging
      console.log("Notification config:", JSON.stringify({
        emailEnabled: notificationConfig.emailNotifications.enabled,
        emailRecipients: notificationConfig.emailNotifications.recipients,
        telegramEnabled: notificationConfig.telegramNotifications.enabled,
        telegramChatIds: notificationConfig.telegramNotifications.chatIds,
        hasBotToken: !!notificationConfig.telegramNotifications.botToken,
      }));

      // Send Telegram notifications if enabled
      const telegramPromises = [];
      if (notificationConfig.telegramNotifications.enabled &&
          notificationConfig.telegramNotifications.botToken &&
          notificationConfig.telegramNotifications.chatIds.length > 0) {
        console.log("Preparing Telegram notifications...");
        const {message, inlineKeyboard} = generateTelegramNotification(bookingData);
        for (const chatId of notificationConfig.telegramNotifications.chatIds) {
          telegramPromises.push(
              sendTelegramMessage(
                  notificationConfig.telegramNotifications.botToken,
                  chatId,
                  message,
                  inlineKeyboard,
              ).then(() => {
                console.log(`Telegram sent to chat ${chatId}`);
              }).catch((err) => {
                console.error(`Telegram failed for chat ${chatId}:`, err.message);
              }),
          );
        }
      } else {
        console.log("Telegram notifications skipped - not configured or disabled");
      }

      // Use Promise.allSettled to continue even if some notifications fail
      const results = await Promise.allSettled([
        ...emailPromises,
        ...telegramPromises,
      ]);

      // Log results
      const failures = results.filter((r) => r.status === "rejected");
      const successes = results.filter((r) => r.status === "fulfilled");
      console.log(`Notifications: ${successes.length} succeeded, ${
        failures.length} failed`);

      if (failures.length > 0) {
        failures.forEach((f, i) => {
          console.error(`Failure ${i + 1}:`, f.reason?.message || f.reason);
        });
      }

      return {success: failures.length === 0};
    },
);

