import { useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DatePicker } from "./DatePicker";
import { WeekPicker } from "./WeekPicker";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";

interface HeaderProps {
  date?: Date;
  onDateChange?: (date: Date) => void;
  weekStartDate?: Date;
  onWeekChange?: (date: Date) => void;
}

export function Header({
  date,
  onDateChange,
  weekStartDate,
  onWeekChange
}: HeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { permissions, role } = useRole();

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

  return (
    <header className="bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between p-4">
        {/* Left: Hamburger Menu */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 w-72">
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

        {/* Center: Date/Week Picker */}
        <div className="flex-1 flex justify-center">
          {location.pathname === "/" && date && onDateChange ? (
            <DatePicker date={date} onDateChange={onDateChange} />
          ) : location.pathname === "/availability" && weekStartDate && onWeekChange ? (
            <WeekPicker weekStartDate={weekStartDate} onWeekChange={onWeekChange} />
          ) : null}
        </div>

        {/* Right: User Profile */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{currentUser?.displayName || currentUser?.email}</span>
        </div>
      </div>
    </header>
  );
}
