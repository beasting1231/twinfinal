import { useState, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { startOfWeek, format } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { Account } from "./components/Account/Account";
import { BookingSources } from "./components/BookingSources";
import { Accounting } from "./components/Accounting";
import { Priority } from "./components/Priority";
import { Forms } from "./components/Forms";
import { UserManagement } from "./components/UserManagement";
import { BookingRequestForm } from "./components/BookingRequestForm";
import { useBookings } from "./hooks/useBookings";
import { usePilots } from "./hooks/usePilots";
import { useDriverLocation } from "./hooks/useDriverLocation";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EditingProvider } from "./contexts/EditingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Login } from "./components/Auth/Login";
import { ProtectedRoute } from "./components/Auth/ProtectedRoute";
import { getTimeSlotsByDate } from "./utils/timeSlots";

// Component for the Daily Plan route
function DailyPlanPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const { currentUser } = useAuth();
  const { bookings, loading: bookingsLoading, addBooking, updateBooking, deleteBooking } = useBookings();

  const filteredBookings = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(booking => booking.date === selectedDateStr);
  }, [bookings, selectedDate]);

  const { pilots, loading: pilotsLoading, isPilotAvailableForTimeSlot } = usePilots(selectedDate);
  const isLoading = pilotsLoading || bookingsLoading;
  const timeSlots = useMemo(() => getTimeSlotsByDate(selectedDate), [selectedDate]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
      />
      <ScheduleGrid
        selectedDate={selectedDate}
        pilots={pilots}
        timeSlots={timeSlots}
        bookings={filteredBookings}
        allBookingsForSearch={bookings}
        isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
        loading={isLoading}
        currentUserDisplayName={currentUser?.displayName || currentUser?.email || undefined}
        onAddBooking={addBooking}
        onUpdateBooking={updateBooking}
        onDeleteBooking={deleteBooking}
        onNavigateToDate={setSelectedDate}
      />
    </div>
  );
}

// Component for the Availability route
function AvailabilityPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
      />
      <AvailabilityGrid weekStartDate={weekStartDate} />
    </div>
  );
}

// Simple page wrapper for other routes
function PageWrapper({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
      />
      {children}
    </div>
  );
}

function AppContent() {
  // Automatically track driver location for users with driver role
  useDriverLocation();

  return (
    <Routes>
      {/* Public route */}
      <Route path="/booking-request" element={<BookingRequestForm />} />

      {/* Login route */}
      <Route path="/login" element={<Login />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <DailyPlanPage />
        </ProtectedRoute>
      } />

      <Route path="/availability" element={
        <ProtectedRoute>
          <AvailabilityPage />
        </ProtectedRoute>
      } />

      <Route path="/account" element={
        <ProtectedRoute>
          <PageWrapper>
            <Account />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/booking-sources" element={
        <ProtectedRoute>
          <PageWrapper>
            <BookingSources />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/accounting" element={
        <ProtectedRoute>
          <PageWrapper>
            <Accounting />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/priority" element={
        <ProtectedRoute>
          <PageWrapper>
            <Priority />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/forms" element={
        <ProtectedRoute>
          <PageWrapper>
            <Forms />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/user-management" element={
        <ProtectedRoute>
          <PageWrapper>
            <UserManagement />
          </PageWrapper>
        </ProtectedRoute>
      } />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <EditingProvider>
            <AppContent />
          </EditingProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
