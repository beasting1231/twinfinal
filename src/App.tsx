import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { startOfWeek, startOfMonth, format, addDays, subDays } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { AvailabilityMonthGrid } from "./components/AvailabilityMonthGrid";
import { AvailabilityOverviewTable } from "./components/AvailabilityOverviewTable";
import { Account } from "./components/Account/Account";
import { BookingSources } from "./components/BookingSources";
import { Accounting } from "./components/Accounting";
import { Priority } from "./components/Priority";
import { Forms } from "./components/Forms";
import { GiftVouchers } from "./components/GiftVouchers";
import { GiftVoucherForm } from "./components/GiftVoucherForm";
import { LiabilityForm } from "./components/LiabilityForm";
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
import { useRole } from "./hooks/useRole";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EditingProvider } from "./contexts/EditingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Login } from "./components/Auth/Login";
import { ProtectedRoute } from "./components/Auth/ProtectedRoute";
import { getTimeSlotsByDate } from "./utils/timeSlots";
import { SWISS_TIME_ZONE } from "./utils/timezone";

function toDate(value: any): Date | null {
  if (!value) return null;
  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getSwissDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SWISS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

// Component for the Daily Plan route
function DailyPlanPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [historyState, setHistoryState] = useState<{ isActive: boolean; timestamp: Date | null }>({
    isActive: false,
    timestamp: null,
  });

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

  const { pilots, loading: pilotsLoading, isPilotAvailableForTimeSlot, getPilotAvailabilityStatus, getPilotSignInTimeForTimeSlot, getPilotSignOutTimeForTimeSlot, availabilityTimelineEvents, saveCustomPilotOrder } = usePilots(
    selectedDate,
    historyState.isActive ? historyState.timestamp : null
  );

  const getHistoryTimelineEvents = useCallback((historyDate: Date) => {
    const visibleDateKey = format(selectedDate, "yyyy-MM-dd");
    const historyDateKey = format(historyDate, "yyyy-MM-dd");
    const timestamps = new Map<number, Date>();

    bookings.forEach((booking) => {
      if (booking.date !== visibleDateKey) return;

      booking.history?.forEach((entry) => {
        const entryDate = toDate(entry.timestamp);
        if (!entryDate || getSwissDateKey(entryDate) !== historyDateKey) return;
        timestamps.set(entryDate.getTime(), entryDate);
      });

      const createdAt = toDate(booking.createdAt);
      if (createdAt && getSwissDateKey(createdAt) === historyDateKey) {
        timestamps.set(createdAt.getTime(), createdAt);
      }
    });

    availabilityTimelineEvents.forEach((eventDate) => {
      if (getSwissDateKey(eventDate) === historyDateKey) {
        timestamps.set(eventDate.getTime(), eventDate);
      }
    });

    return Array.from(timestamps.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [availabilityTimelineEvents, bookings, selectedDate]);

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
        onHistoryStateChange={setHistoryState}
        getHistoryTimelineEvents={getHistoryTimelineEvents}
      />
      <ScheduleGrid
        selectedDate={selectedDate}
        pilots={pilots}
        timeSlots={timeSlots}
        bookings={filteredBookings}
        allBookingsForSearch={bookings}
        isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
        getPilotAvailabilityStatus={getPilotAvailabilityStatus}
        getPilotSignInTimeForTimeSlot={getPilotSignInTimeForTimeSlot}
        getPilotSignOutTimeForTimeSlot={getPilotSignOutTimeForTimeSlot}
        saveCustomPilotOrder={saveCustomPilotOrder}
        loading={isLoading}
        currentUserDisplayName={currentUserDisplayName}
        historyMode={historyState.isActive}
        historyTimestamp={historyState.timestamp}
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
  const { role } = useRole();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthStartDate, setMonthStartDate] = useState(startOfMonth(new Date()));
  const [availabilityViewMode, setAvailabilityViewMode] = useState<'week' | 'month' | 'overview'>('week');

  const showOverviewForDate = (date: Date) => {
    if (role !== 'admin') return;
    setMonthStartDate(startOfMonth(date));
    setAvailabilityViewMode('overview');
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-zinc-950">
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
        <AvailabilityGrid
          weekStartDate={weekStartDate}
          onShowOverview={() => showOverviewForDate(weekStartDate)}
        />
      ) : availabilityViewMode === 'month' || role !== 'admin' ? (
        <AvailabilityMonthGrid
          monthStartDate={monthStartDate}
          onShowOverview={() => showOverviewForDate(monthStartDate)}
        />
      ) : (
        <AvailabilityOverviewTable
          monthStartDate={monthStartDate}
          onBack={() => setAvailabilityViewMode('month')}
        />
      )}
    </div>
  );
}

// Simple page wrapper for other routes
function PageWrapper({ children, disablePageScroll = false }: { children: React.ReactNode; disablePageScroll?: boolean }) {
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
      <div className={`flex-1 ${disablePageScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
        {children}
      </div>
    </div>
  );
}

// Loading fallback for lazy-loaded routes
function LazyLoadingFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function DriversPage() {
  const { role } = useRole();

  if (role !== "admin" && role !== "driver") {
    return <Navigate to="/" replace />;
  }

  return (
    <PageWrapper>
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Drivers</h1>
      </div>
    </PageWrapper>
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

      <Route path="/drivers" element={
        <ProtectedRoute>
          <DriversPage />
        </ProtectedRoute>
      } />

      <Route path="/accounting" element={
        <ProtectedRoute>
          <PageWrapper disablePageScroll>
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

      <Route path="/liability-form" element={
        <ProtectedRoute>
          <PageWrapper>
            <LiabilityForm />
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
          <PageWrapper disablePageScroll>
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
