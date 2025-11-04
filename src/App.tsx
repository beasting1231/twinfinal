import { useState, useMemo, useEffect } from "react";
import { startOfWeek, format } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { Account } from "./components/Account/Account";
import { BookingSources } from "./components/BookingSources";
import { Accounting } from "./components/Accounting";
import { Priority } from "./components/Priority";
import { Forms } from "./components/Forms";
import { BookingRequestForm } from "./components/BookingRequestForm";
import { useBookings } from "./hooks/useBookings";
import { usePilots } from "./hooks/usePilots";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EditingProvider } from "./contexts/EditingContext";
import { Login } from "./components/Auth/Login";
import { getTimeSlotsByDate } from "./utils/timeSlots";

type View = "daily-plan" | "availability" | "account" | "booking-sources" | "accounting" | "priority" | "forms";

function AppContent() {
  // Check if we're on the booking request form route
  const [isBookingRequestRoute, setIsBookingRequestRoute] = useState(
    window.location.pathname === "/booking-request"
  );

  useEffect(() => {
    // Handle browser navigation
    const handlePopState = () => {
      setIsBookingRequestRoute(window.location.pathname === "/booking-request");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // If on booking request route, show the public form (no auth required)
  if (isBookingRequestRoute) {
    return <BookingRequestForm />;
  }
  const [currentView, setCurrentView] = useState<View>("daily-plan");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { currentUser } = useAuth();

  // Fetch bookings from Firebase
  const { bookings, loading: bookingsLoading, addBooking, updateBooking, deleteBooking } = useBookings();

  // Filter bookings for the selected date
  const filteredBookings = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(booking => booking.date === selectedDateStr);
  }, [bookings, selectedDate]);

  // Fetch available pilots for the selected date, passing bookings for sorting
  const { pilots, loading: pilotsLoading, isPilotAvailableForTimeSlot } = usePilots(selectedDate);

  // Wait for both pilots and bookings to load before showing the schedule
  const isLoading = pilotsLoading || bookingsLoading;

  // Time slots for the schedule - dynamically determined based on the selected date
  const timeSlots = useMemo(() => getTimeSlotsByDate(selectedDate), [selectedDate]);

  // Show login if user is not authenticated
  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 dark">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      {currentView === "daily-plan" ? (
        <ScheduleGrid
          selectedDate={selectedDate}
          pilots={pilots}
          timeSlots={timeSlots}
          bookings={filteredBookings}
          isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
          loading={isLoading}
          currentUserDisplayName={currentUser?.displayName || undefined}
          onAddBooking={addBooking}
          onUpdateBooking={updateBooking}
          onDeleteBooking={deleteBooking}
          onNavigateToDate={setSelectedDate}
        />
      ) : currentView === "availability" ? (
        <AvailabilityGrid weekStartDate={weekStartDate} />
      ) : currentView === "account" ? (
        <Account />
      ) : currentView === "booking-sources" ? (
        <BookingSources />
      ) : currentView === "accounting" ? (
        <Accounting />
      ) : currentView === "priority" ? (
        <Priority />
      ) : currentView === "forms" ? (
        <Forms />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <EditingProvider>
        <AppContent />
      </EditingProvider>
    </AuthProvider>
  );
}

export default App;
