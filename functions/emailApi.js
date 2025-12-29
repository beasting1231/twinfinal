const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const {ImapFlow} = require("imapflow");
const {simpleParser} = require("mailparser");
const nodemailer = require("nodemailer");

// Initialize admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const emailApp = express();
emailApp.use(cors({origin: true}));
emailApp.use(express.json());

// Strip /api prefix if present (Firebase Hosting rewrites include it, Vite proxy strips it)
emailApp.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  next();
});

// Auth middleware - verify Firebase ID token
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({error: "Unauthorized"});
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;

    // Check admin role
    const userDoc = await db.collection("userProfiles").doc(req.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
      return res.status(403).json({error: "Admin access required"});
    }

    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(401).json({error: "Invalid token"});
  }
};

emailApp.use(authMiddleware);

// Get email settings from Firestore
emailApp.get("/settings", async (req, res) => {
  try {
    const doc = await db.collection("settings").doc("emailSettings").get();
    if (!doc.exists) {
      return res.json({settings: null});
    }
    res.json({settings: doc.data()});
  } catch (error) {
    console.error("Error getting settings:", error);
    res.status(500).json({error: error.message});
  }
});

// Save email settings to Firestore
emailApp.post("/settings", async (req, res) => {
  try {
    const settings = req.body;
    await db.collection("settings").doc("emailSettings").set(settings);
    res.json({success: true});
  } catch (error) {
    console.error("Error saving settings:", error);
    res.status(500).json({error: error.message});
  }
});

// Get folders from IMAP
emailApp.post("/folders", async (req, res) => {
  const settings = req.body;

  if (!settings.imapHost || !settings.imapUsername || !settings.imapPassword) {
    return res.status(400).json({error: "Missing IMAP settings"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    await client.logout();

    const folders = mailboxes.map((mb) => ({
      id: mb.path,
      name: mb.name,
      path: mb.path,
      delimiter: mb.delimiter,
      flags: mb.flags,
    }));

    res.json({folders});
  } catch (error) {
    console.error("IMAP folders error:", error);
    res.status(500).json({error: error.message});
  }
});

// Get emails from a folder
emailApp.post("/emails", async (req, res) => {
  const {settings, folderId, limit = 50} = req.body;

  if (!settings || !folderId) {
    return res.status(400).json({error: "Missing settings or folder"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(folderId);

    const emails = [];
    if (mailbox.exists > 0) {
      // Fetch last N messages
      const start = Math.max(1, mailbox.exists - limit + 1);
      const range = `${start}:*`;

      for await (const msg of client.fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
      })) {
        emails.push({
          uid: msg.uid,
          read: msg.flags.has("\\Seen"),
          answered: msg.flags.has("\\Answered"),
          from: msg.envelope.from?.[0]?.name || msg.envelope.from?.[0]?.address || "",
          to: msg.envelope.to?.[0]?.address || "",
          subject: msg.envelope.subject || "(No subject)",
          date: msg.envelope.date?.toISOString() || null,
        });
      }
    }

    await client.logout();

    // Sort by date descending
    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({emails});
  } catch (error) {
    console.error("IMAP emails error:", error);
    res.status(500).json({error: error.message});
  }
});

// Get email content
emailApp.post("/email/:uid", async (req, res) => {
  const {uid} = req.params;
  const {settings, folderId} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);

    // Fetch message with flags
    const message = await client.fetchOne(uid, {source: true, flags: true}, {uid: true});
    const parsed = await simpleParser(message.source);

    // Get flags before marking as seen
    const wasRead = message.flags.has("\\Seen");
    const starred = message.flags.has("\\Flagged");

    // Mark as seen
    await client.messageFlagsAdd(uid, ["\\Seen"], {uid: true});
    await client.logout();

    res.json({
      email: {
        uid: parseInt(uid),
        from: parsed.from?.text || "",
        to: parsed.to?.text || "",
        subject: parsed.subject || "(No subject)",
        date: parsed.date?.toISOString() || null,
        body: parsed.text || "",
        html: parsed.html || null,
        read: true, // We just marked it as read
        starred: starred,
      },
    });
  } catch (error) {
    console.error("IMAP email content error:", error);
    res.status(500).json({error: error.message});
  }
});

// Send email via SMTP
emailApp.post("/send", async (req, res) => {
  const {settings, to, subject, body} = req.body;

  if (!settings || !to || !subject) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const userTransporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: parseInt(settings.smtpPort) || 587,
    secure: settings.smtpSsl && parseInt(settings.smtpPort) === 465,
    auth: {
      user: settings.smtpUsername,
      pass: settings.smtpPassword,
    },
  });

  try {
    // Check if body contains HTML (images or formatting)
    const isHtml = body.includes("<img") || body.includes("<br") || body.includes("<p>");

    const mailOptions = {
      from: settings.smtpUsername,
      to,
      subject,
      ...(isHtml ? {html: body, text: body.replace(/<[^>]*>/g, "")} : {text: body}),
    };

    // Send the email
    const info = await userTransporter.sendMail(mailOptions);

    // Build RFC 822 message to save to Sent folder
    const sentDate = new Date().toUTCString();
    let rawMessage;
    if (isHtml) {
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;
      rawMessage = [
        `From: ${settings.smtpUsername}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${sentDate}`,
        `Message-ID: ${info.messageId || `<${Date.now()}@${settings.smtpHost}>`}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body.replace(/<[^>]*>/g, ""),
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        body,
        ``,
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      rawMessage = [
        `From: ${settings.smtpUsername}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${sentDate}`,
        `Message-ID: ${info.messageId || `<${Date.now()}@${settings.smtpHost}>`}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
      ].join("\r\n");
    }

    // Save to Sent folder via IMAP
    const client = new ImapFlow({
      host: settings.imapHost,
      port: parseInt(settings.imapPort) || 993,
      secure: settings.imapSsl !== false,
      auth: {
        user: settings.imapUsername,
        pass: settings.imapPassword,
      },
      logger: false,
    });

    try {
      await client.connect();

      // Try common Sent folder names
      const sentFolders = ["Sent", "[Gmail]/Sent Mail", "Sent Items", "Sent Messages", "INBOX.Sent"];
      let saved = false;

      for (const sentFolder of sentFolders) {
        try {
          await client.append(sentFolder, rawMessage, ["\\Seen"]);
          saved = true;
          break;
        } catch {
          // Try next folder name
        }
      }

      if (!saved) {
        console.warn("Could not save email to Sent folder - no matching folder found");
      }

      await client.logout();
    } catch (imapError) {
      // Log but don't fail - the email was still sent
      console.warn("Could not save to Sent folder:", imapError.message);
    }

    res.json({success: true});
  } catch (error) {
    console.error("SMTP send error:", error);
    res.status(500).json({error: error.message});
  }
});

// Delete email (move to Trash)
emailApp.post("/delete", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);

    // Try to move to Trash folder (common names)
    const trashFolders = ["Trash", "[Gmail]/Trash", "Deleted Items", "Deleted"];
    let moved = false;

    for (const trash of trashFolders) {
      try {
        await client.messageMove(uid, trash, {uid: true});
        moved = true;
        break;
      } catch {
        // Try next folder name
      }
    }

    // If no trash folder found, just mark as deleted
    if (!moved) {
      await client.messageFlagsAdd(uid, ["\\Deleted"], {uid: true});
      await client.messageDelete(uid, {uid: true});
    }

    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Delete email error:", error);
    res.status(500).json({error: error.message});
  }
});

// Archive email (move to Archive folder)
emailApp.post("/archive", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);

    // Try to move to Archive folder (common names)
    const archiveFolders = ["Archive", "[Gmail]/All Mail", "All Mail"];
    let moved = false;

    for (const archive of archiveFolders) {
      try {
        await client.messageMove(uid, archive, {uid: true});
        moved = true;
        break;
      } catch {
        // Try next folder name
      }
    }

    if (!moved) {
      throw new Error("Could not find archive folder");
    }

    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Archive email error:", error);
    res.status(500).json({error: error.message});
  }
});

// Mark email as unread
emailApp.post("/mark-unread", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);
    await client.messageFlagsRemove(uid, ["\\Seen"], {uid: true});
    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Mark unread error:", error);
    res.status(500).json({error: error.message});
  }
});

// Mark email as read
emailApp.post("/mark-read", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);
    await client.messageFlagsAdd(uid, ["\\Seen"], {uid: true});
    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({error: error.message});
  }
});

// Move email to Inbox (for unarchive/restore)
emailApp.post("/move-to-inbox", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);
    await client.messageMove(uid, "INBOX", {uid: true});
    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Move to inbox error:", error);
    res.status(500).json({error: error.message});
  }
});

// Search emails by content
emailApp.post("/search", async (req, res) => {
  const {settings, folderId, query} = req.body;

  if (!settings || !folderId || !query) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);

    // Search for emails matching the query in body, subject, or from fields
    // IMAP SEARCH uses OR to combine multiple criteria
    const searchResults = await client.search({
      or: [
        {body: query},
        {subject: query},
        {from: query},
      ],
    }, {uid: true});

    // Fetch details for matching emails
    const emails = [];
    if (searchResults.length > 0) {
      // Pass {uid: true} as third parameter to interpret searchResults as UIDs
      for await (const msg of client.fetch(searchResults, {
        flags: true,
        envelope: true,
      }, {uid: true})) {
        emails.push({
          uid: msg.uid,
          read: msg.flags.has("\\Seen"),
          answered: msg.flags.has("\\Answered"),
          from: msg.envelope.from?.[0]?.name || msg.envelope.from?.[0]?.address || "",
          to: msg.envelope.to?.[0]?.address || "",
          subject: msg.envelope.subject || "(No subject)",
          date: msg.envelope.date?.toISOString() || null,
        });
      }
    }

    await client.logout();

    // Sort by date descending
    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({emails});
  } catch (error) {
    console.error("IMAP search error:", error);
    res.status(500).json({error: error.message});
  }
});

// Mark email as answered (for reply tracking)
emailApp.post("/mark-answered", async (req, res) => {
  const {settings, folderId, uid} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);
    await client.messageFlagsAdd(uid, ["\\Answered"], {uid: true});
    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Mark answered error:", error);
    res.status(500).json({error: error.message});
  }
});

// Star/flag email
emailApp.post("/star", async (req, res) => {
  const {settings, folderId, uid, starred} = req.body;

  if (!settings || !folderId || !uid) {
    return res.status(400).json({error: "Missing required parameters"});
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: parseInt(settings.imapPort) || 993,
    secure: settings.imapSsl !== false,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(folderId);

    if (starred) {
      await client.messageFlagsAdd(uid, ["\\Flagged"], {uid: true});
    } else {
      await client.messageFlagsRemove(uid, ["\\Flagged"], {uid: true});
    }

    await client.logout();
    res.json({success: true});
  } catch (error) {
    console.error("Star email error:", error);
    res.status(500).json({error: error.message});
  }
});

// Export as v1 HTTP function (publicly accessible)
exports.emailApi = functions.https.onRequest(emailApp);
