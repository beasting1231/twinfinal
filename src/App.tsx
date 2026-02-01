import { useState, useMemo, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { startOfWeek, startOfMonth, format, addDays, subDays } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { AvailabilityMonthGrid } from "./components/AvailabilityMonthGrid";
import { Account } from "./components/Account/Account";
import { BookingSources } from "./components/BookingSources";
import { Accounting } from "./components/Accounting";
import { Priority } from "./components/Priority";
import { Forms } from "./components/Forms";
import { GiftVouchers } from "./components/GiftVouchers";
import { GiftVoucherForm } from "./components/GiftVoucherForm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { retryImport } from "./utils/retryImport";

// Code-split: NotificationSettings (Phase 1 - Low risk, rarely accessed)
const NotificationSettings = lazy(() =>
  retryImport(() =>
    import("./components/NotificationSettings").then((module) => ({
      default: module.NotificationSettings,
    }))
  )
);

// Code-split: Admin routes (Phase 2 - Admin-only, low risk)
const UserManagement = lazy(() =>
  retryImport(() =>
    import("./components/UserManagement").then((module) => ({
      default: module.UserManagement,
    }))
  )
);

const Email = lazy(() =>
  retryImport(() =>
    import("./components/Email").then((module) => ({
      default: module.Email,
    }))
  )
);
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

  const { currentUser, userProfile } = useAuth();

  // Optimize: Only load bookings ±7 days from selected date
  const dateRange = useMemo(() => ({
    start: subDays(selectedDate, 7),
    end: addDays(selectedDate, 7),
  }), [selectedDate]);

  const { bookings, addBooking, updateBooking, deleteBooking } = useBookings({ dateRange });

  // Get display name from user profile (already loaded by AuthContext)
  const currentUserDisplayName = userProfile?.displayName || currentUser?.email || undefined;

  const filteredBookings = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(booking => booking.date === selectedDateStr);
  }, [bookings, selectedDate]);

  const { pilots, loading: pilotsLoading, isPilotAvailableForTimeSlot, getPilotAvailabilityStatus, saveCustomPilotOrder } = usePilots(selectedDate);

  // Progressive loading: Only wait for pilots data, not bookings
  // The grid will show immediately with pilots, and bookings will populate as they load
  const isLoading = pilotsLoading;
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
        getPilotAvailabilityStatus={getPilotAvailabilityStatus}
        saveCustomPilotOrder={saveCustomPilotOrder}
        loading={isLoading}
        currentUserDisplayName={currentUserDisplayName}
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
  const [monthStartDate, setMonthStartDate] = useState(startOfMonth(new Date()));
  const [availabilityViewMode, setAvailabilityViewMode] = useState<'week' | 'month'>('week');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
        monthStartDate={monthStartDate}
        onMonthChange={setMonthStartDate}
        availabilityViewMode={availabilityViewMode}
        onAvailabilityViewModeChange={setAvailabilityViewMode}
      />
      {availabilityViewMode === 'week' ? (
        <AvailabilityGrid weekStartDate={weekStartDate} />
      ) : (
        <AvailabilityMonthGrid monthStartDate={monthStartDate} />
      )}
    </div>
  );
}

// Simple page wrapper for other routes
function PageWrapper({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-zinc-950">
      <Header
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
      />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// Loading fallback for lazy-loaded routes
function LazyLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function AppContent() {
  // Automatically track driver location for users with driver role
  useDriverLocation();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/booking-request" element={<BookingRequestForm />} />
      <Route path="/gift-voucher" element={<GiftVoucherForm />} />

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

      <Route path="/gift-vouchers" element={
        <ProtectedRoute>
          <PageWrapper>
            <GiftVouchers />
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/notifications" element={
        <ProtectedRoute>
          <PageWrapper>
            <ErrorBoundary>
              <Suspense fallback={<LazyLoadingFallback />}>
                <NotificationSettings />
              </Suspense>
            </ErrorBoundary>
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/user-management" element={
        <ProtectedRoute>
          <PageWrapper>
            <ErrorBoundary>
              <Suspense fallback={<LazyLoadingFallback />}>
                <UserManagement />
              </Suspense>
            </ErrorBoundary>
          </PageWrapper>
        </ProtectedRoute>
      } />

      <Route path="/email" element={
        <ProtectedRoute>
          <PageWrapper>
            <ErrorBoundary>
              <Suspense fallback={<LazyLoadingFallback />}>
                <Email />
              </Suspense>
            </ErrorBoundary>
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
