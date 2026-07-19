import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import type { Booking, BookingRequest } from "../types/index";
import { format, parse } from "date-fns";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

interface SearchBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: Booking[];
  timeSlots: string[];
  onBookingClick: (booking: Booking) => void;
  onWaitlistClick?: (request: BookingRequest) => void;
}

const RESULTS_PER_PAGE = 10;

type SearchResult =
  | { type: "booking"; booking: Booking }
  | { type: "waitlist"; request: BookingRequest };

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesQuery(queryText: string, fieldValue: string, isPhone = false): boolean {
  const normalizedQuery = normalizeSearchText(queryText);
  if (!normalizedQuery) return false;

  const normalizedField = normalizeSearchText(fieldValue);
  if (normalizedField.includes(normalizedQuery)) return true;

  const compactQuery = compactSearchText(queryText);
  const compactField = compactSearchText(fieldValue);
  if (compactQuery && compactField.includes(compactQuery)) return true;

  if (isPhone) {
    const queryDigits = normalizePhoneDigits(queryText);
    const fieldDigits = normalizePhoneDigits(fieldValue);
    if (queryDigits && fieldDigits.includes(queryDigits)) return true;
  }

  return false;
}

function getStatusBadgeClass(status?: Booking["bookingStatus"]) {
  if (status === "confirmed") {
    return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400";
  }
  if (status === "unconfirmed") {
    return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400";
  }
  if (status === "pending") {
    return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400";
  }
  if (status === "cancelled" || status === "deleted" || status === "no show") {
    return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400";
  }
  return "bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300";
}

export function SearchBookingModal({
  open,
  onOpenChange,
  bookings,
  timeSlots,
  onBookingClick,
  onWaitlistClick,
}: SearchBookingModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(RESULTS_PER_PAGE);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [waitlistRequests, setWaitlistRequests] = useState<BookingRequest[]>([]);
  const [hasLoadedAllBookings, setHasLoadedAllBookings] = useState(false);
  const [isLoadingAllBookings, setIsLoadingAllBookings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadAllBookings = async () => {
      setHasLoadedAllBookings(false);
      setIsLoadingAllBookings(true);
      setLoadError(null);

      try {
        const bookingsQuery = query(collection(db, "bookings"), orderBy("date", "desc"));
        const snapshot = await getDocs(bookingsQuery);
        if (cancelled) return;

        const fetchedBookings = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];

        setAllBookings(fetchedBookings);

        try {
          const waitlistQuery = query(
            collection(db, "bookingRequests"),
            where("status", "==", "waitlist")
          );
          const waitlistSnapshot = await getDocs(waitlistQuery);
          if (cancelled) return;

          const fetchedWaitlist = waitlistSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
            } as BookingRequest;
          });

          setWaitlistRequests(fetchedWaitlist);
        } catch (error) {
          console.error("Error loading waitlist entries for search:", error);
          if (!cancelled) {
            setWaitlistRequests([]);
            setLoadError("Could not load waiting list entries. Showing bookings only.");
          }
        }

        setHasLoadedAllBookings(true);
      } catch (error) {
        console.error("Error loading all bookings for search:", error);
        if (cancelled) return;

        // Fallback to currently loaded bookings in memory
        setAllBookings(bookings);
        setWaitlistRequests([]);
        setHasLoadedAllBookings(true);
        setLoadError("Could not load all bookings. Showing currently loaded bookings.");
      } finally {
        if (!cancelled) {
          setIsLoadingAllBookings(false);
        }
      }
    };

    loadAllBookings();

    return () => {
      cancelled = true;
    };
  }, [open, bookings]);

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    if (!hasLoadedAllBookings) return [];

    const bookingResults: SearchResult[] = allBookings
      .filter((booking) => {
        if (booking.isBlocked || booking.bookingSource === "Blocked") {
          return false;
        }

        const customerName = booking.customerName || "";
        const phoneNumber = booking.phoneNumber || "";
        const email = booking.email || "";
        const bookingSource = booking.bookingSource || "";

        return (
          matchesQuery(searchQuery, customerName) ||
          matchesQuery(searchQuery, phoneNumber, true) ||
          matchesQuery(searchQuery, email) ||
          matchesQuery(searchQuery, bookingSource)
        );
      })
      .map((booking) => ({ type: "booking", booking }));

    const waitlistResults: SearchResult[] = waitlistRequests
      .filter((request) => {
        const customerName = request.customerName || "";
        const phoneNumber = `${request.phoneCountryCode || ""} ${request.phone || ""}`.trim();
        const email = request.email || "";
        const bookingSource = request.bookingSource || "";

        return (
          matchesQuery(searchQuery, customerName) ||
          matchesQuery(searchQuery, phoneNumber, true) ||
          matchesQuery(searchQuery, email) ||
          matchesQuery(searchQuery, bookingSource)
        );
      })
      .map((request) => ({ type: "waitlist", request }));

    return [...bookingResults, ...waitlistResults].sort((a, b) => {
      const dateA = a.type === "booking" ? a.booking.date || "" : a.request.date || "";
      const dateB = b.type === "booking" ? b.booking.date || "" : b.request.date || "";
      return dateB.localeCompare(dateA);
    });
  }, [allBookings, hasLoadedAllBookings, searchQuery, waitlistRequests]);

  const displayedResults = useMemo(() => {
    return filteredResults.slice(0, displayCount);
  }, [filteredResults, displayCount]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setDisplayCount(RESULTS_PER_PAGE);
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const scrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (scrolledToBottom && displayCount < filteredResults.length) {
      setDisplayCount((prev) => Math.min(prev + RESULTS_PER_PAGE, filteredResults.length));
    }
  }, [displayCount, filteredResults.length]);

  const handleBookingClick = (booking: Booking) => {
    onBookingClick(booking);
    onOpenChange(false);
    setSearchQuery("");
  };

  const handleWaitlistClick = (request: BookingRequest) => {
    onWaitlistClick?.(request);
    onOpenChange(false);
    setSearchQuery("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchQuery("");
      setDisplayCount(RESULTS_PER_PAGE);
      setAllBookings([]);
      setWaitlistRequests([]);
      setHasLoadedAllBookings(false);
      setIsLoadingAllBookings(false);
      setLoadError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Search Bookings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search by name, phone number, email, or source..."
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
            {isLoadingAllBookings && (
              <div className="py-2 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="animate-pulse">Loading...</span>
              </div>
            )}

            {loadError && (
              <div className="py-2 text-center text-sm text-red-600 dark:text-red-400">
                {loadError}
              </div>
            )}

            {searchQuery.trim() === "" ? (
              !isLoadingAllBookings && (
                <div className="flex items-center justify-center py-12 text-gray-500 dark:text-zinc-400">
                  Enter a search query to find bookings
                </div>
              )
            ) : filteredResults.length === 0 && hasLoadedAllBookings && !isLoadingAllBookings ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-zinc-400">
                No bookings found
              </div>
            ) : (
              <>
                {displayedResults.map((result) => {
                  if (result.type === "waitlist") {
                    const request = result.request;
                    const timeSlot = request.availableTimes?.length
                      ? request.availableTimes.join(", ")
                      : request.time || timeSlots[request.timeIndex] || "Unknown time";
                    const dateStr = request.date || "";
                    let formattedDate = "";
                    try {
                      const date = parse(dateStr, "yyyy-MM-dd", new Date());
                      formattedDate = format(date, "MMM dd, yyyy");
                    } catch {
                      formattedDate = dateStr;
                    }

                    return (
                      <div
                        key={`waitlist-${request.id}`}
                        onClick={() => handleWaitlistClick(request)}
                        className="p-4 rounded-lg cursor-pointer transition-colors border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {request.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
                              {request.bookingSource && (
                                <div>Source: {request.bookingSource}</div>
                              )}
                              {request.phone && (
                                <div>Phone: {[request.phoneCountryCode, request.phone].filter(Boolean).join(" ")}</div>
                              )}
                              {request.email && (
                                <div>Email: {request.email}</div>
                              )}
                              <div>People: {request.numberOfPeople}</div>
                              {request.notes && (
                                <div className="text-gray-500 dark:text-zinc-500 italic">
                                  {request.notes}
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
                              <span className="inline-block px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                                waiting list
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const booking = result.booking;
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
                              getStatusBadgeClass(booking.bookingStatus)
                            }`}>
                              {booking.bookingStatus || "unknown"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {displayCount < filteredResults.length && (
                  <div className="py-4 text-center text-sm text-gray-500 dark:text-zinc-400">
                    Showing {displayCount} of {filteredResults.length} results. Scroll down to load more...
                  </div>
                )}

                {displayCount >= filteredResults.length && filteredResults.length > RESULTS_PER_PAGE && (
                  <div className="py-4 text-center text-sm text-gray-500 dark:text-zinc-400">
                    All {filteredResults.length} results loaded
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
