import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where, type Firestore } from "firebase/firestore";
import { parse } from "date-fns";
import type { AvailabilityStatus } from "../types/index";
import { getTimeSlotsByDate } from "./timeSlots";

export function normalizeAvailabilityStatus(status?: AvailabilityStatus | null): AvailabilityStatus {
  if (status === "onRequest") return "onRequest";
  if (status === "unavailable") return "unavailable";
  return "available";
}

export function isAvailabilityActive(status?: AvailabilityStatus | null): boolean {
  if (!status) {
    return false;
  }

  return status !== "unavailable";
}

interface SetAvailabilityStatusParams {
  db: Firestore;
  userId: string;
  date: string;
  timeSlot: string;
  status: AvailabilityStatus;
}

export async function setAvailabilityStatus({ db, userId, date, timeSlot, status }: SetAvailabilityStatusParams) {
  const availabilityQuery = query(
    collection(db, "availability"),
    where("userId", "==", userId),
    where("date", "==", date),
    where("timeSlot", "==", timeSlot)
  );

  const snapshot = await getDocs(availabilityQuery);
  const now = new Date().toISOString();

  if (snapshot.empty) {
    if (status === "unavailable") {
      return { changed: false, timestamp: null as string | null };
    }

    const newRecord: Record<string, unknown> = {
      userId,
      date,
      timeSlot,
      status,
      signedInAt: now,
    };

    await addDoc(collection(db, "availability"), newRecord);
    return { changed: true, timestamp: now };
  }

  const existingStatuses = snapshot.docs.map((docSnapshot) =>
    normalizeAvailabilityStatus(docSnapshot.data().status)
  );
  const hadActiveStatus = existingStatuses.some((existingStatus) => isAvailabilityActive(existingStatus));

  const updates: Record<string, unknown> = {
    status,
  };

  if (status === "unavailable") {
    updates.signedOutAt = now;
  } else if (!hadActiveStatus) {
    updates.signedInAt = now;
  }

  await Promise.all(
    snapshot.docs.map((docSnapshot) =>
      updateDoc(doc(db, "availability", docSnapshot.id), updates)
    )
  );

  return { changed: true, timestamp: now };
}

export async function unassignPilotFromBookings(db: Firestore, dateStr: string, timeSlot: string, pilotUserId: string) {
  try {
    const userProfileDoc = await getDoc(doc(db, "userProfiles", pilotUserId));
    if (!userProfileDoc.exists()) {
      console.log("User profile not found");
      return;
    }

    const pilotDisplayName = userProfileDoc.data()?.displayName;
    if (!pilotDisplayName) {
      console.log("Display name not found in user profile");
      return;
    }

    const date = parse(dateStr, "yyyy-MM-dd", new Date());
    const timeSlots = getTimeSlotsByDate(date);
    const timeIndex = timeSlots.indexOf(timeSlot);

    if (timeIndex === -1) {
      console.log(`Time slot ${timeSlot} not found for date ${dateStr}`);
      return;
    }

    const bookingsQuery = query(
      collection(db, "bookings"),
      where("date", "==", dateStr)
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);

    const updatePromises = bookingsSnapshot.docs.map(async (bookingDoc) => {
      const bookingData = bookingDoc.data();

      if (bookingData.timeIndex === timeIndex && bookingData.assignedPilots) {
        const assignedIndex = bookingData.assignedPilots.findIndex(
          (pilotName: string) => pilotName === pilotDisplayName
        );

        if (assignedIndex !== -1) {
          const updatedPilots = [...bookingData.assignedPilots];
          updatedPilots[assignedIndex] = "";

          const updates: Record<string, unknown> = {
            assignedPilots: updatedPilots,
          };

          if (bookingData.pilotPayments && Array.isArray(bookingData.pilotPayments)) {
            updates.pilotPayments = bookingData.pilotPayments.filter(
              (payment: { pilotName?: string }) => payment.pilotName !== pilotDisplayName
            );
          }

          await updateDoc(doc(db, "bookings", bookingDoc.id), updates);
          console.log(`Unassigned ${pilotDisplayName} from booking ${bookingDoc.id} and removed payment details`);
        }
      }
    });

    await Promise.all(updatePromises);
  } catch (error) {
    console.error("Error unassigning pilot from bookings:", error);
  }
}
