import { useState } from "react";
import { startOfWeek } from "date-fns";
import { Header } from "./components/Header";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { AvailabilityGrid } from "./components/AvailabilityGrid";
import { WeekPicker } from "./components/WeekPicker";

type View = "daily-plan" | "availability";

function App() {
  const [currentView, setCurrentView] = useState<View>("availability");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Sample data - based on the image
  const pilots = ["Pilot 1", "Pilot 1", "Pilot 1", "Pilot 1", "Pilot 1"];
  const timeSlots = ["7:30", "8:30", "9:45", "11:00", "12:30", "14:00", "15:30", "16:45"];

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 dark">
      <Header
        userName="User Name"
        date={selectedDate}
        onDateChange={setSelectedDate}
        weekStartDate={weekStartDate}
        onWeekChange={setWeekStartDate}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      {currentView === "daily-plan" ? (
        <ScheduleGrid pilots={pilots} timeSlots={timeSlots} />
      ) : (
        <AvailabilityGrid weekStartDate={weekStartDate} timeSlots={timeSlots} />
      )}
    </div>
  );
}

export default App;
