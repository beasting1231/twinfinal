import { useState } from "react";
import { Menu } from "lucide-react";
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

type View = "daily-plan" | "availability" | "account" | "booking-sources" | "accounting" | "priority";

interface HeaderProps {
  date?: Date;
  onDateChange?: (date: Date) => void;
  weekStartDate?: Date;
  onWeekChange?: (date: Date) => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

export function Header({
  date,
  onDateChange,
  weekStartDate,
  onWeekChange,
  currentView,
  onViewChange
}: HeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      setSheetOpen(false);
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const handleViewChange = (view: View) => {
    onViewChange(view);
    setSheetOpen(false);
  };

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
              <button
                onClick={() => handleViewChange("daily-plan")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "daily-plan" ? "bg-zinc-800" : ""
                }`}
              >
                Daily Plan
              </button>
              <button
                onClick={() => handleViewChange("availability")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "availability" ? "bg-zinc-800" : ""
                }`}
              >
                Availability
              </button>
              <button
                onClick={() => handleViewChange("booking-sources")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "booking-sources" ? "bg-zinc-800" : ""
                }`}
              >
                Booking Sources
              </button>
              <button
                onClick={() => handleViewChange("accounting")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "accounting" ? "bg-zinc-800" : ""
                }`}
              >
                Accounting
              </button>
              <button
                onClick={() => handleViewChange("priority")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "priority" ? "bg-zinc-800" : ""
                }`}
              >
                Priority
              </button>
              <button
                onClick={() => handleViewChange("account")}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-800 transition-colors text-white ${
                  currentView === "account" ? "bg-zinc-800" : ""
                }`}
              >
                Account
              </button>
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
          {currentView === "daily-plan" && date && onDateChange ? (
            <DatePicker date={date} onDateChange={onDateChange} />
          ) : currentView === "availability" && weekStartDate && onWeekChange ? (
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
