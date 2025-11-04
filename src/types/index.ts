export interface ReceiptFile {
  data: string; // base64 encoded image
  filename: string;
}

export interface PilotPayment {
  pilotName: string;
  amount: number | string; // string allows for temporary states like "-" or ""
  paymentMethod: "direkt" | "ticket" | "ccp";
  receiptFiles?: ReceiptFile[];
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
  bookingStatus: "unconfirmed" | "confirmed" | "pending" | "cancelled";
  span: number;
  pilotPayments?: PilotPayment[];
  driver?: string;
  vehicle?: string;
  driver2?: string;
  vehicle2?: string;
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
