import type { Booking, BookingRequest } from "../types/index";

// Website bookings paid up front via SumUp (twinn-react-app). The request is marked paid by
// functions/websiteBookingTicket.js; the flag is carried over when it's put on the schedule.

export function prepaidFields(request: BookingRequest): Pick<Booking, "prepaid" | "paymentReference" | "amount"> | Record<string, never> {
  if (request.formId !== "website" || request.paymentStatus !== "paid") return {};
  return {
    prepaid: true,
    ...(request.paymentReference ? { paymentReference: request.paymentReference } : {}),
    ...(typeof request.amount === "number" ? { amount: request.amount } : {}),
  };
}

// Prepaid replaces the open statuses; cancelled / no show still show as such.
export function showsPrepaid(booking: { prepaid?: boolean; bookingStatus?: Booking["bookingStatus"] }) {
  return !!booking.prepaid && booking.bookingStatus !== "cancelled" &&
    booking.bookingStatus !== "deleted" && booking.bookingStatus !== "no show";
}
