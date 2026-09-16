import type { Booking } from "../types/index";

// Keep deletion and its history snapshot consistent, including status-only edits.
export function clearDeletedBookingAssignments<T extends Partial<Booking>>(booking: T): T {
  if (booking.bookingStatus !== "deleted") return booking;
  return {
    ...booking,
    assignedPilots: [],
    acknowledgedPilots: [],
    pilotPayments: [],
  };
}

export function getAccountingBookings<T extends Pick<Booking, "bookingStatus">>(bookings: T[]): T[] {
  // Older deleted records may still contain pilot assignments and payments.
  return bookings.filter(booking => booking.bookingStatus !== "deleted");
}
