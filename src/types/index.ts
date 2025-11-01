export interface Booking {
  id?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  pilotIndex: number;
  timeIndex: number;
  customerName: string;
  numberOfPeople: number;
  pickupLocation: string;
  bookingSource: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  assignedPilots: string[];
  bookingStatus: "confirmed" | "pending" | "cancelled";
  span: number;
}

export interface UnavailablePilot {
  id?: string;
  pilotIndex: number;
  timeIndex: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  femalePilot: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Pilot {
  uid: string;
  displayName: string;
  femalePilot: boolean;
}

export type BookingStatus = "available" | "booked" | "noPilot";
