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
  const { permissions } = useRole();

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
    <header className="bg-zinc-950 border-b border-zinc-800 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between p-4">
        {/* Left: Hamburger Menu */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-zinc-800">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-zinc-900 border-zinc-700 w-72">
            <SheetHeader>
              <SheetTitle className="text-white text-xl">Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 mt-6">
              {permissions.canViewAllBookings && (
                <button
                  onClick={() => handleNavigate("/")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/") ? "bg-zinc-800" : ""
                  }`}
                >
                  Daily Plan
                </button>
              )}
              {permissions.canManageOwnAvailability && (
                <button
                  onClick={() => handleNavigate("/availability")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/availability") ? "bg-zinc-800" : ""
                  }`}
                >
                  Availability
                </button>
              )}
              {permissions.canManageDriversAndSources && (
                <button
                  onClick={() => handleNavigate("/booking-sources")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/booking-sources") ? "bg-zinc-800" : ""
                  }`}
                >
                  Booking Sources
                </button>
              )}
              {permissions.canAccessAccounting && (
                <button
                  onClick={() => handleNavigate("/accounting")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/accounting") ? "bg-zinc-800" : ""
                  }`}
                >
                  Accounting
                </button>
              )}
              {permissions.canManageDriversAndSources && (
                <button
                  onClick={() => handleNavigate("/priority")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/priority") ? "bg-zinc-800" : ""
                  }`}
                >
                  Priority
                </button>
              )}
              {permissions.canManageBookingRequests && (
                <button
                  onClick={() => handleNavigate("/forms")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/forms") ? "bg-zinc-800" : ""
                  }`}
                >
                  Forms
                </button>
              )}
              <button
                onClick={() => handleNavigate("/account")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  isActive("/account") ? "bg-zinc-800" : ""
                }`}
              >
                Account
              </button>
              {permissions.canManageRoles && (
                <button
                  onClick={() => handleNavigate("/user-management")}
                  className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                    isActive("/user-management") ? "bg-zinc-800" : ""
                  }`}
                >
                  User Management
                </button>
              )}
              <div className="my-2 border-t border-zinc-700" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-red-400 hover:text-red-300"
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
          <span className="text-sm font-medium">{currentUser?.displayName || currentUser?.email}</span>
        </div>
      </div>
    </header>
  );
}
