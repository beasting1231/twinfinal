/* eslint-disable no-console */
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const BOOKING_SEARCH_INDEX_COLLECTION = "bookingSearchIndex";
const BATCH_SIZE = 250;

function normalizeSearchText(value) {
  if (!value || typeof value !== "string") return "";
  return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
}

function normalizePhoneDigits(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\D/g, "");
}

function addPrefixTokens(tokenSet, value, maxPrefixLength = 24, maxTokens = 240) {
  if (!value || tokenSet.size >= maxTokens) return;
  const token = value.slice(0, 80);
  const maxLen = Math.min(token.length, maxPrefixLength);

  for (let i = 1; i <= maxLen; i++) {
    tokenSet.add(token.slice(0, i));
    if (tokenSet.size >= maxTokens) break;
  }
}

function buildSearchPrefixes(bookingData) {
  const tokenSet = new Set();
  const maxTokens = 240;

  const customerName = normalizeSearchText(bookingData.customerName || "");
  const email = normalizeSearchText(bookingData.email || "");
  const phoneDigits = normalizePhoneDigits(bookingData.phoneNumber || "");
  const bookingSource = normalizeSearchText(bookingData.bookingSource || "");

  const nameParts = customerName.split(/[^a-z0-9]+/).filter(Boolean);
  for (const part of nameParts) {
    addPrefixTokens(tokenSet, part, 24, maxTokens);
  }

  if (email) {
    addPrefixTokens(tokenSet, email, 40, maxTokens);
    const emailParts = email.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of emailParts) {
      addPrefixTokens(tokenSet, part, 24, maxTokens);
    }
  }

  if (bookingSource) {
    addPrefixTokens(tokenSet, bookingSource, 40, maxTokens);
    const sourceParts = bookingSource.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of sourceParts) {
      addPrefixTokens(tokenSet, part, 24, maxTokens);
    }
  }

  if (phoneDigits) {
    addPrefixTokens(tokenSet, phoneDigits, 20, maxTokens);
  }

  return Array.from(tokenSet);
}

function buildBookingSearchIndexDocument(bookingId, bookingData) {
  const customerName = typeof bookingData.customerName === "string" ? bookingData.customerName : "";
  const email = typeof bookingData.email === "string" ? bookingData.email : "";
  const phoneNumber = typeof bookingData.phoneNumber === "string" ? bookingData.phoneNumber : "";
  const bookingSource = typeof bookingData.bookingSource === "string" ? bookingData.bookingSource : "";
  const notes = typeof bookingData.notes === "string" ? bookingData.notes : "";
  const date = typeof bookingData.date === "string" ? bookingData.date : "";
  const timeIndex = typeof bookingData.timeIndex === "number" ? bookingData.timeIndex : 0;
  const numberOfPeople = typeof bookingData.numberOfPeople === "number" ? bookingData.numberOfPeople : 0;
  const bookingStatus = typeof bookingData.bookingStatus === "string" ? bookingData.bookingStatus : "pending";

  return {
    bookingId,
    customerName,
    customerNameNormalized: normalizeSearchText(customerName),
    email,
    emailNormalized: normalizeSearchText(email),
    phoneNumber,
    phoneDigits: normalizePhoneDigits(phoneNumber),
    bookingSource,
    notes,
    date,
    timeIndex,
    numberOfPeople,
    bookingStatus,
    searchPrefixes: buildSearchPrefixes(bookingData),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function runBackfill() {
  console.log("Starting bookingSearchIndex backfill...");
  let processed = 0;
  let lastDocId = null;

  while (true) {
    let bookingsQuery = db
        .collection("bookings")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(BATCH_SIZE);

    if (lastDocId) {
      bookingsQuery = bookingsQuery.startAfter(lastDocId);
    }

    const snapshot = await bookingsQuery.get();
    if (snapshot.empty) break;

    const batch = db.batch();

    for (const bookingDoc of snapshot.docs) {
      const indexDoc = buildBookingSearchIndexDocument(bookingDoc.id, bookingDoc.data());
      batch.set(
          db.collection(BOOKING_SEARCH_INDEX_COLLECTION).doc(bookingDoc.id),
          indexDoc,
          {merge: true},
      );
    }

    await batch.commit();

    processed += snapshot.size;
    lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
    console.log(`Indexed ${processed} bookings...`);
  }

  console.log(`Backfill complete. Indexed ${processed} bookings.`);
}

runBackfill()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
