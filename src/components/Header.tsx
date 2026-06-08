import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DatePicker } from "./DatePicker";
import { WeekPicker } from "./WeekPicker";
import { MonthPicker } from "./MonthPicker";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import { getSwissDateTime, SWISS_TIME_ZONE } from "../utils/timezone";

interface HeaderProps {
  date?: Date;
  onDateChange?: (date: Date) => void;
  weekStartDate?: Date;
  onWeekChange?: (date: Date) => void;
  monthStartDate?: Date;
  onMonthChange?: (date: Date) => void;
  availabilityViewMode?: 'week' | 'month' | 'overview';
  onAvailabilityViewModeChange?: (mode: 'week' | 'month' | 'overview') => void;
  onHistoryStateChange?: (state: { isActive: boolean; timestamp: Date | null }) => void;
  getHistoryTimelineEvents?: (date: Date) => Date[];
}

interface HistoryHoverState {
  rect: DOMRect;
  entries: Array<{
    user: string;
    action?: string;
    timestamp?: string;
    timestampValue?: string;
    text?: string;
    accentText?: string;
  }>;
}

export function Header({
  date,
  onDateChange,
  weekStartDate,
  onWeekChange,
  monthStartDate,
  onMonthChange,
  availabilityViewMode = 'week',
  onAvailabilityViewModeChange,
  onHistoryStateChange,
  getHistoryTimelineEvents
}: HeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState(() => date || new Date());
  const [historyMinute, setHistoryMinute] = useState(720);
  const [historyHover, setHistoryHover] = useState<HistoryHoverState | null>(null);
  const historyOverlayRef = useRef<HTMLDivElement | null>(null);
  const historyTouchRef = useRef<{ x: number; y: number } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { permissions, role } = useRole();
  const showHistoryButton = location.pathname === "/" && role === "admin";
  const historyTime = `${String(Math.floor(historyMinute / 60)).padStart(2, "0")}:${String(historyMinute % 60).padStart(2, "0")}`;
  const historySliderPercent = (historyMinute / 1440) * 100;
  const historyTimestamp = useMemo(
    () => getSwissDateTime(historyDate, historyMinute),
    [historyDate, historyMinute]
  );
  const historyTimelineMarkers = useMemo(() => {
    const events = getHistoryTimelineEvents?.(historyDate) || [];

    return events.map((eventDate) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: SWISS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(eventDate);

      const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
      const hour = Number(getPart("hour"));
      const minute = Number(getPart("minute"));
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

      return {
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        left: `${((hour * 60 + minute) / 1440) * 100}%`,
      };
    }).filter((marker): marker is { time: string; left: string } => Boolean(marker));
  }, [getHistoryTimelineEvents, historyDate]);

  const getCurrentSwissMinute = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SWISS_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const hour = Number(getPart("hour"));
    const minute = Number(getPart("minute"));

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return 720;
    }

    return Math.min(1440, Math.max(0, hour * 60 + minute));
  };

  const getCurrentSwissDate = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SWISS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const year = Number(getPart("year"));
    const month = Number(getPart("month"));
    const day = Number(getPart("day"));

    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return new Date();
    }

    return new Date(year, month - 1, day);
  };

  const handleHistoryButtonClick = () => {
    setHistoryOpen((open) => {
      if (!open) {
        setHistoryDate(getCurrentSwissDate());
        setHistoryMinute(getCurrentSwissMinute());
      }
      return !open;
    });
  };

  const exitHistoryMode = () => {
    setHistoryOpen(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setSheetOpen(false);
      navigate("/login");
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setSheetOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  const handleHistoryOverlayMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const overlay = historyOverlayRef.current;
    if (!overlay) return;

    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(event.clientX, event.clientY);
    overlay.style.pointerEvents = "";

    if (target?.closest("[data-history-ignore='true']")) {
      setHistoryHover(null);
      return;
    }

    const highlightTarget = target?.closest(
      "[data-history-hover-target], button, a, input, select, textarea, [role='button'], [data-date-cell='true'], [tabindex]:not([tabindex='-1'])"
    );

    if (!(highlightTarget instanceof HTMLElement)) {
      setHistoryHover(null);
      return;
    }

    const serializedHistory = highlightTarget.dataset.historyEntries;
    const entries = (() => {
      if (!serializedHistory) return [];

      try {
        const parsed = JSON.parse(serializedHistory);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry) => {
          if (!entry || typeof entry.user !== "string") return false;
          if (!entry.timestampValue) return true;

          const entryDate = new Date(entry.timestampValue);
          if (Number.isNaN(entryDate.getTime())) return true;

          return entryDate.getTime() <= historyTimestamp.getTime();
        });
      } catch {
        return [];
      }
    })();

    setHistoryHover({
      rect: highlightTarget.getBoundingClientRect(),
      entries: entries.length > 0
        ? entries
        : !serializedHistory && (highlightTarget.dataset.historyUser || highlightTarget.dataset.historyTooltip)
        ? [{
            user: highlightTarget.dataset.historyUser || highlightTarget.dataset.historyTooltip || "",
            action: highlightTarget.dataset.historyAction,
            timestamp: highlightTarget.dataset.historyTimestamp,
            timestampValue: highlightTarget.dataset.historyTimestampValue,
          }]
        : [],
    });
  };

  const getScrollableElementUnderOverlay = (clientX: number, clientY: number) => {
    const overlay = historyOverlayRef.current;
    if (!overlay) return null;

    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(clientX, clientY);
    overlay.style.pointerEvents = "";

    return target?.closest(".overflow-auto") as HTMLElement | null;
  };

  const handleHistoryOverlayWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const scrollElement = getScrollableElementUnderOverlay(event.clientX, event.clientY);
    if (!scrollElement) return;

    event.preventDefault();
    scrollElement.scrollBy({
      left: event.deltaX,
      top: event.deltaY,
      behavior: "auto",
    });
  };

  const handleHistoryOverlayTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    historyTouchRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleHistoryOverlayTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const previousTouch = historyTouchRef.current;
    if (!touch || !previousTouch) return;

    const scrollElement = getScrollableElementUnderOverlay(touch.clientX, touch.clientY);
    if (!scrollElement) return;

    event.preventDefault();
    scrollElement.scrollBy({
      left: previousTouch.x - touch.clientX,
      top: previousTouch.y - touch.clientY,
      behavior: "auto",
    });
    historyTouchRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const getHistoryActionClassName = (action?: string) => {
    switch (action) {
      case "created":
        return "text-emerald-400 dark:text-emerald-600";
      case "edited":
        return "text-sky-400 dark:text-sky-600";
      case "moved":
        return "text-amber-400 dark:text-amber-600";
      case "status_changed":
        return "text-violet-400 dark:text-violet-600";
      case "pilot_assigned":
      case "pilot_unassigned":
        return "text-blue-400 dark:text-blue-600";
      case "payment":
        return "text-teal-400 dark:text-teal-600";
      case "signed_out":
        return "text-yellow-400 dark:text-yellow-600";
      default:
        return "text-zinc-300 dark:text-zinc-600";
    }
  };

  useEffect(() => {
    if (!historyOpen || !showHistoryButton) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      setHistoryMinute((minute) => {
        const nextMinute = event.key === "ArrowLeft" ? minute - 15 : minute + 15;
        return Math.min(1440, Math.max(0, nextMinute));
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyOpen, showHistoryButton]);

  useEffect(() => {
    if (!historyOpen && date) {
      setHistoryDate(date);
    }
  }, [date, historyOpen]);

  useEffect(() => {
    onHistoryStateChange?.({
      isActive: showHistoryButton && historyOpen,
      timestamp: showHistoryButton && historyOpen ? historyTimestamp : null,
    });
  }, [historyOpen, historyTimestamp, onHistoryStateChange, showHistoryButton]);

  return (
    <>
    <header data-history-ignore="true" className="bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between p-4">
        {/* Left: Hamburger Menu */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 w-72 pt-[calc(env(safe-area-inset-top)+1rem)]">
            <SheetHeader>
              <SheetTitle className="text-gray-900 dark:text-white text-xl">Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 mt-6">
              {permissions.canViewAllBookings && (
                <button
                  onClick={() => handleNavigate("/")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Daily Plan
                </button>
              )}
              {role === 'admin' && (
                <button
                  onClick={() => handleNavigate("/email")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/email") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Email
                </button>
              )}
              {permissions.canManageOwnAvailability && (
                <button
                  onClick={() => handleNavigate("/availability")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/availability") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Availability
                </button>
              )}
              {permissions.canManageDriversAndSources && (
                <button
                  onClick={() => handleNavigate("/booking-sources")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/booking-sources") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Booking Sources
                </button>
              )}
              {(role === "admin" || role === "driver") && (
                <button
                  onClick={() => handleNavigate("/drivers")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/drivers") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Drivers
                </button>
              )}
              {permissions.canAccessAccounting && (
                <button
                  onClick={() => handleNavigate("/accounting")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/accounting") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Accounting
                </button>
              )}
              {permissions.canManageDriversAndSources && (
                <button
                  onClick={() => handleNavigate("/priority")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/priority") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Priority
                </button>
              )}
              {permissions.canManageBookingRequests && (
                <button
                  onClick={() => handleNavigate("/forms")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/forms") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Forms
                </button>
              )}
              {permissions.canManageNotifications && (
                <button
                  onClick={() => handleNavigate("/notifications")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/notifications") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  Notifications
                </button>
              )}
              <button
                onClick={() => handleNavigate("/account")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                  isActive("/account") ? "bg-gray-100 dark:bg-zinc-800" : ""
                }`}
              >
                Account
              </button>
              {permissions.canManageRoles && (
                <button
                  onClick={() => handleNavigate("/user-management")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-900 dark:text-white ${
                    isActive("/user-management") ? "bg-gray-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  User Management
                </button>
              )}
              <div className="my-2 border-t border-gray-200 dark:border-zinc-700" />
              {role !== 'agency' && (
                <a
                  href="https://chat.whatsapp.com/H2y3eieWEsRDi64oysgzEr"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSheetOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 transition-colors text-white font-medium"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  Join Daily Chat
                </a>
              )}
              <div className="my-2 border-t border-gray-200 dark:border-zinc-700" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              >
                Logout
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Center: Date/Week/Month Picker */}
        <div className="flex-1 flex justify-center items-center gap-2">
          {location.pathname === "/" && date && onDateChange ? (
            <DatePicker date={date} onDateChange={onDateChange} />
          ) : location.pathname === "/drivers" && monthStartDate && onMonthChange ? (
            <MonthPicker monthStartDate={monthStartDate} onMonthChange={onMonthChange} />
          ) : location.pathname === "/availability" ? (
            <>
              {/* View mode selector */}
              {onAvailabilityViewModeChange && (
                <select
                  value={availabilityViewMode}
                  onChange={(e) => onAvailabilityViewModeChange(e.target.value as 'week' | 'month' | 'overview')}
                  className="bg-white dark:bg-zinc-900 border-2 border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm font-medium shadow-sm hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  {role === 'admin' && <option value="overview">Overview</option>}
                </select>
              )}
              {/* Show appropriate picker based on view mode */}
              {availabilityViewMode === 'week' && weekStartDate && onWeekChange ? (
                <WeekPicker weekStartDate={weekStartDate} onWeekChange={onWeekChange} />
              ) : (availabilityViewMode === 'month' || availabilityViewMode === 'overview') && monthStartDate && onMonthChange ? (
                <MonthPicker monthStartDate={monthStartDate} onMonthChange={onMonthChange} />
              ) : null}
            </>
          ) : null}
        </div>

        {/* Right: User Profile */}
        <div className="flex items-center gap-2">
          {showHistoryButton ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleHistoryButtonClick}
              className={`h-9 px-3 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-800 ${
                historyOpen ? "relative z-[2147483647]" : ""
              }`}
            >
              {historyOpen ? "exit history" : "history"}
            </Button>
          ) : (
            <span className="text-sm font-medium text-gray-900 dark:text-white">{currentUser?.displayName || currentUser?.email}</span>
          )}
        </div>
      </div>
    </header>
    {showHistoryButton && historyOpen && (
      <>
        <div
          ref={historyOverlayRef}
          className="fixed inset-0 z-[2147483646] bg-transparent backdrop-saturate-50"
          onMouseMove={handleHistoryOverlayMouseMove}
          onWheel={handleHistoryOverlayWheel}
          onTouchStart={handleHistoryOverlayTouchStart}
          onTouchMove={handleHistoryOverlayTouchMove}
          onTouchEnd={() => {
            historyTouchRef.current = null;
          }}
          onMouseLeave={() => setHistoryHover(null)}
        />
        {historyHover && (
          <div
            className="pointer-events-none fixed z-[2147483646] rounded-md bg-blue-500/20 ring-2 ring-blue-500/50 transition-[left,top,width,height] duration-75"
            style={{
              left: historyHover.rect.left - 3,
              top: historyHover.rect.top - 3,
              width: historyHover.rect.width + 6,
              height: historyHover.rect.height + 6,
            }}
          />
        )}
        {historyHover && historyHover.entries.length > 0 && (
          <div
            className="pointer-events-none fixed z-[2147483646] max-w-[520px] -translate-x-1/2 rounded bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-zinc-950"
            style={{
              left: historyHover.rect.left + historyHover.rect.width / 2,
              top: Math.max(8, historyHover.rect.top - Math.min(220, 22 + historyHover.entries.length * 20)),
            }}
          >
            <div className="max-h-48 overflow-hidden">
              {historyHover.entries.map((entry, index) => (
                <div key={`${entry.user}-${entry.action}-${entry.timestamp}-${index}`} className="flex h-5 max-w-full items-center gap-1.5 whitespace-nowrap leading-5">
                  {entry.text ? (
                    <span className="min-w-0 truncate">{entry.text}</span>
                  ) : (
                    <span className="min-w-0 truncate">{entry.user}</span>
                  )}
                  {entry.accentText ? (
                    <span className={`shrink-0 font-semibold ${getHistoryActionClassName(entry.action)}`}>
                      {entry.accentText}
                    </span>
                  ) : entry.action && !entry.text ? (
                    <span className={`shrink-0 font-semibold ${getHistoryActionClassName(entry.action)}`}>
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  ) : null}
                  {entry.timestamp && (
                    <span className="shrink-0 text-zinc-400 dark:text-zinc-500">
                      {entry.timestamp}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-[2147483647] flex justify-center px-3 pointer-events-none">
          <div className="history-bar-border pointer-events-auto relative flex min-h-20 w-[min(1100px,calc(100vw-24px))] flex-col gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.18)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={exitHistoryMode}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              aria-label="Exit history mode"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setHistoryDate((currentDate) => addDays(currentDate, -1))}
                className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Previous history date"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-36 rounded px-2 py-1 text-center text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {format(historyDate, "EEE d MMM")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="z-[2147483647] w-auto p-0 bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800" align="center" side="top">
                  <Calendar
                    mode="single"
                    selected={historyDate}
                    onSelect={(selectedDate) => {
                      if (selectedDate) {
                        setHistoryDate(selectedDate);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setHistoryDate((currentDate) => addDays(currentDate, 1))}
                className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Next history date"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="relative pt-5">
              {historyTimelineMarkers.map((marker, index) => (
                <span
                  key={`${marker.time}-${marker.left}-${index}`}
                  className="pointer-events-none absolute bottom-[14px] z-10 h-[5px] w-0.5 -translate-x-1/2 rounded-full bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.75)]"
                  style={{ left: marker.left }}
                  title={marker.time}
                />
              ))}
              <span
                className="absolute top-0 -translate-x-1/2 text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
                style={{ left: `${historySliderPercent}%` }}
              >
                {historyTime}
              </span>
              <input
                type="range"
                min="0"
                max="1440"
                step="15"
                value={historyMinute}
                onChange={(event) => setHistoryMinute(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-zinc-900 dark:accent-white"
                aria-label="History time of day"
              />
            </div>
          </div>
        </div>
      </>
    )}
    </>
  );
}
