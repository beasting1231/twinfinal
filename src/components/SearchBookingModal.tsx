import { useState, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import type { Booking } from "../types/index";
import { format, parse } from "date-fns";

interface SearchBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: Booking[];
  timeSlots: string[];
  onBookingClick: (booking: Booking) => void;
}

const RESULTS_PER_PAGE = 10;

export function SearchBookingModal({
  open,
  onOpenChange,
  bookings,
  timeSlots,
  onBookingClick,
}: SearchBookingModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(RESULTS_PER_PAGE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter bookings based on search query (name, phone, or email)
  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase().trim();

    return bookings
      .filter(booking => {
        const customerName = booking.customerName?.toLowerCase() || "";
        const phoneNumber = booking.phoneNumber?.toLowerCase() || "";
        const email = booking.email?.toLowerCase() || "";

        return (
          customerName.includes(query) ||
          phoneNumber.includes(query) ||
          email.includes(query)
        );
      })
      .sort((a, b) => {
        // Sort by date (newest first)
        const dateA = a.date || "";
        const dateB = b.date || "";
        return dateB.localeCompare(dateA);
      });
  }, [bookings, searchQuery]);

  // Get only the bookings to display (paginated)
  const displayedBookings = useMemo(() => {
    return filteredBookings.slice(0, displayCount);
  }, [filteredBookings, displayCount]);

  // Reset display count when search query changes
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setDisplayCount(RESULTS_PER_PAGE);
  }, []);

  // Handle scroll to load more results
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const scrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (scrolledToBottom && displayCount < filteredBookings.length) {
      setDisplayCount(prev => Math.min(prev + RESULTS_PER_PAGE, filteredBookings.length));
    }
  }, [displayCount, filteredBookings.length]);

  const handleBookingClick = (booking: Booking) => {
    onBookingClick(booking);
    onOpenChange(false);
    setSearchQuery("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearchQuery("");
      setDisplayCount(RESULTS_PER_PAGE);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Search Bookings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search by name, phone number, or email..."
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus
            className="w-full bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border-gray-300 dark:border-zinc-700"
          />

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="overflow-y-auto max-h-[calc(80vh-200px)] space-y-2"
          >
            {searchQuery.trim() === "" ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-zinc-400">
                Enter a search query to find bookings
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-zinc-400">
                No bookings found
              </div>
            ) : (
              <>
                {displayedBookings.map((booking) => {
                const timeSlot = timeSlots[booking.timeIndex] || "Unknown time";
                const dateStr = booking.date || "";
                let formattedDate = "";
                try {
                  const date = parse(dateStr, "yyyy-MM-dd", new Date());
                  formattedDate = format(date, "MMM dd, yyyy");
                } catch {
                  formattedDate = dateStr;
                }

                const isDeleted = booking.bookingStatus === "deleted";

                return (
                  <div
                    key={booking.id}
                    onClick={() => handleBookingClick(booking)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      isDeleted
                        ? "border-2 border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50"
                        : "border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className={`font-semibold ${isDeleted ? "text-red-700 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                          {booking.customerName}
                          {isDeleted && <span className="ml-2 text-xs font-normal text-red-500 dark:text-red-400">(Deleted)</span>}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
                          {booking.bookingSource && (
                            <div>Source: {booking.bookingSource}</div>
                          )}
                          {booking.phoneNumber && (
                            <div>Phone: {booking.phoneNumber}</div>
                          )}
                          {booking.email && (
                            <div>Email: {booking.email}</div>
                          )}
                          <div>People: {booking.numberOfPeople}</div>
                          {booking.notes && (
                            <div className="text-gray-500 dark:text-zinc-500 italic">
                              {booking.notes}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formattedDate}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {timeSlot}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-block px-2 py-0.5 text-xs rounded ${
                            booking.bookingStatus === "confirmed"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                              : booking.bookingStatus === "pending"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400"
                          }`}>
                            {booking.bookingStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Show loading indicator or info message */}
              {displayCount < filteredBookings.length && (
                <div className="py-4 text-center text-sm text-gray-500 dark:text-zinc-400">
                  Showing {displayCount} of {filteredBookings.length} results. Scroll down to load more...
                </div>
              )}

              {displayCount >= filteredBookings.length && filteredBookings.length > RESULTS_PER_PAGE && (
                <div className="py-4 text-center text-sm text-gray-500 dark:text-zinc-400">
                  All {filteredBookings.length} results loaded
                </div>
              )}
            </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
