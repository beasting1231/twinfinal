import { useState, useMemo } from "react";
import { startOfWeek, format } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { Account } from "./components/Account/Account";
import { useBookings } from "./hooks/useBookings";
import { usePilots } from "./hooks/usePilots";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Auth/Login";
import { getTimeSlotsByDate } from "./utils/timeSlots";

type View = "daily-plan" | "availability" | "account";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("daily-plan");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { currentUser } = useAuth();

  // Fetch bookings and unavailable pilots from Firebase
  const { bookings, unavailablePilots, addBooking, updateBooking, deleteBooking } = useBookings();

  // Filter bookings for the selected date
  const filteredBookings = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(booking => booking.date === selectedDateStr);
  }, [bookings, selectedDate]);

  // Fetch available pilots for the selected date
  const { pilots, loading: pilotsLoading, isPilotAvailableForTimeSlot } = usePilots(selectedDate);

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
          unavailablePilots={unavailablePilots}
          isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
          loading={pilotsLoading}
          onAddBooking={addBooking}
          onUpdateBooking={updateBooking}
          onDeleteBooking={deleteBooking}
        />
      ) : currentView === "availability" ? (
        <AvailabilityGrid weekStartDate={weekStartDate} />
      ) : currentView === "account" ? (
        <Account />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
