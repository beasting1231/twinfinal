export interface ReceiptFile {
  data?: string; // base64 encoded image (legacy)
  url?: string; // Firebase Storage URL
  filename: string;
}

export interface PilotPayment {
  pilotName: string;
  amount: number | string; // string allows for temporary states like "-" or ""
  paymentMethod: "direkt" | "ticket" | "ccp";
  receiptFiles?: ReceiptFile[];
}

export type BookingHistoryAction =
  | "created"
  | "edited"
  | "moved"
  | "deleted"
  | "restored"
  | "status_changed"
  | "pilot_assigned"
  | "pilot_unassigned";

export interface BookingHistoryEntry {
  action: BookingHistoryAction;
  timestamp: any; // Firestore Timestamp or Date
  userId: string;
  userName: string;
  details?: string; // Optional details about the change (e.g., "from 10:00 to 11:00")
}

export interface Booking {
  id?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  pilotIndex: number;
  timeIndex: number;
  customerName?: string;
  numberOfPeople: number;
  pickupLocation?: string;
  bookingSource: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  commission?: number | null;
  commissionStatus?: "paid" | "unpaid";
  femalePilotsRequired?: number;
  flightType?: "sensational" | "classic" | "early bird";
  assignedPilots: string[];
  bookingStatus: "unconfirmed" | "confirmed" | "pending" | "cancelled" | "deleted";
  span: number;
  pilotPayments?: PilotPayment[];
  driver?: string;
  vehicle?: string;
  driver2?: string;
  vehicle2?: string;
  createdBy?: string; // UID of user who created the booking
  createdByName?: string; // Display name of user who created the booking
  createdAt?: any; // Firestore Timestamp or Date - when booking was created/last moved
  deletedBy?: string; // UID of user who deleted the booking
  deletedByName?: string; // Display name of user who deleted the booking
  deletedAt?: any; // Firestore Timestamp or Date - when booking was deleted
  history?: BookingHistoryEntry[]; // Array of history entries tracking all changes
}

export type UserRole = "pilot" | "agency" | "driver" | "admin" | null;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  femalePilot: boolean;
  priority?: number;
  role?: UserRole; // User's role for access control
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Pilot {
  uid: string;
  displayName: string;
  email?: string;
  femalePilot: boolean;
  priority?: number;
}

export type BookingStatus = "available" | "booked" | "noPilot";

export interface DriverAssignment {
  id?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  timeIndex: number;
  driver?: string;
  vehicle?: string;
  driver2?: string;
  vehicle2?: string;
}

export interface DriverLocation {
  id?: string; // User ID of the driver
  displayName: string; // Driver's name
  latitude: number;
  longitude: number;
  timestamp: Date; // When the location was last updated
  accuracy?: number; // Location accuracy in meters
}

export interface BookingRequest {
  id?: string;
  customerName: string;
  email: string;
  phone?: string;
  phoneCountryCode?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  time: string; // Time string (HH:mm)
  timeIndex: number; // Index of the time slot
  numberOfPeople: number;
  meetingPoint?: string; // HW, OST, mhof, or other
  flightType?: "sensational" | "classic" | "early bird";
  notes?: string;
  bookingSource?: string; // e.g., "Online" for requests from the booking form
  status: "pending" | "approved" | "rejected" | "waitlist";
  createdAt: Date;
}
