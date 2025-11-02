/**
 * Script to clear all availability data from Firebase
 * Run this with: npx tsx src/scripts/clearAvailability.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Initialize Firebase with environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearAvailabilityData() {
  console.log("Starting to clear availability data...");

  try {
    const availabilityRef = collection(db, "availability");
    const snapshot = await getDocs(availabilityRef);

    console.log(`Found ${snapshot.size} availability records to delete`);

    if (snapshot.size === 0) {
      console.log("No availability records found. Collection is already empty.");
      return;
    }

    // Delete all documents
    let count = 0;
    const deletePromises = snapshot.docs.map(async (document) => {
      await deleteDoc(doc(db, "availability", document.id));
      count++;
      if (count % 10 === 0) {
        console.log(`Deleted ${count}/${snapshot.size} records...`);
      }
    });

    await Promise.all(deletePromises);

    console.log(`✅ Successfully deleted all ${snapshot.size} availability records!`);
    console.log("You can now set fresh availability with the new time slots.");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing availability data:", error);
    process.exit(1);
  }
}

clearAvailabilityData();
