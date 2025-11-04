import { useMemo, useState } from "react";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import { useBookings } from "../hooks/useBookings";
import { Search, Filter } from "lucide-react";
import { Input } from "./ui/input";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { FilterDropdown } from "./FilterDropdown";

interface AccountingRow {
  date: string;
  time: string;
  pilot: string;
  payment: number | string;
  paymentMethod: "direkt" | "ticket" | "ccp";
  turn: number;
  pax: number;
  drivers: string[];
  vehicles: string[];
  bookingSource: string;
  bookingIds: string[];
}

export function Accounting() {
  const { bookings, loading } = useBookings();
  const [searchTerm, setSearchTerm] = useState("");

  // Filter states
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 7);
    return {
      from: format(sevenDaysAgo, "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  });
  const [selectedPilots, setSelectedPilots] = useState<string[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // Process bookings into accounting rows
  const accountingData = useMemo(() => {
    if (!bookings || bookings.length === 0) return [];

    // Sort all bookings by date and time (earliest to latest)
    const sortedBookings = [...bookings].sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.timeIndex - b.timeIndex;
    });

    // Calculate turn numbers, total pax, and collect drivers/vehicles for each turn
    const turnNumbers = new Map<string, number>();
    const turnCountsByDate = new Map<string, number>();
    const totalPaxByTurn = new Map<string, number>();
    const driversByTurn = new Map<string, Set<string>>();
    const vehiclesByTurn = new Map<string, Set<string>>();

    sortedBookings.forEach((booking) => {
      const turnKey = `${booking.date}@${booking.timeIndex}`;

      // Set turn number
      if (!turnNumbers.has(turnKey)) {
        const currentCount = (turnCountsByDate.get(booking.date) || 0) + 1;
        turnNumbers.set(turnKey, currentCount);
        turnCountsByDate.set(booking.date, currentCount);
      }

      // Accumulate total pax for this turn
      const currentPax = totalPaxByTurn.get(turnKey) || 0;
      totalPaxByTurn.set(turnKey, currentPax + (booking.numberOfPeople || 0));

      // Collect drivers for this turn
      if (!driversByTurn.has(turnKey)) {
        driversByTurn.set(turnKey, new Set());
      }
      if (booking.driver) driversByTurn.get(turnKey)!.add(booking.driver);
      if (booking.driver2) driversByTurn.get(turnKey)!.add(booking.driver2);

      // Collect vehicles for this turn
      if (!vehiclesByTurn.has(turnKey)) {
        vehiclesByTurn.set(turnKey, new Set());
      }
      if (booking.vehicle) vehiclesByTurn.get(turnKey)!.add(booking.vehicle);
      if (booking.vehicle2) vehiclesByTurn.get(turnKey)!.add(booking.vehicle2);
    });

    // Create rows - one row per assigned pilot per booking
    const rows: AccountingRow[] = [];

    sortedBookings.forEach((booking) => {
      // Skip if no pilots assigned
      if (!booking.assignedPilots || booking.assignedPilots.length === 0) return;

      // Get booking details
      const dateObj = parseISO(booking.date);
      const timeSlotsForDate = getTimeSlotsByDate(dateObj);
      const timeSlot = timeSlotsForDate[booking.timeIndex] || `${booking.timeIndex}:00`;
      const turnKey = `${booking.date}@${booking.timeIndex}`;
      const turnNumber = turnNumbers.get(turnKey) || 1;
      const totalPax = totalPaxByTurn.get(turnKey) || 0;

      // Get all drivers and vehicles for this turn
      const drivers = Array.from(driversByTurn.get(turnKey) || []);
      const vehicles = Array.from(vehiclesByTurn.get(turnKey) || []);

      // Create one row for each assigned pilot
      booking.assignedPilots.forEach((pilotName) => {
        // Try to find payment info for this pilot
        const pilotPayment = booking.pilotPayments?.find(p => p.pilotName === pilotName);

        rows.push({
          date: booking.date,
          time: timeSlot,
          pilot: pilotName,
          payment: pilotPayment?.amount || "-",
          paymentMethod: pilotPayment?.paymentMethod || "direkt",
          turn: turnNumber,
          pax: totalPax,
          drivers,
          vehicles,
          bookingSource: booking.bookingSource || "Unknown",
          bookingIds: booking.id ? [booking.id] : [],
        });
      });
    });

    return rows;
  }, [bookings]);

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    const pilots = new Set<string>();
    const drivers = new Set<string>();
    const vehicles = new Set<string>();
    const sources = new Set<string>();

    accountingData.forEach((row) => {
      pilots.add(row.pilot);
      row.drivers.forEach((d) => drivers.add(d));
      row.vehicles.forEach((v) => vehicles.add(v));
      sources.add(row.bookingSource);
    });

    return {
      pilots: Array.from(pilots).sort(),
      methods: ["Direct", "Ticket", "CCP"],
      drivers: Array.from(drivers).sort(),
      vehicles: Array.from(vehicles).sort(),
      sources: Array.from(sources).sort(),
    };
  }, [accountingData]);

  // Filter rows by all filters and search term
  const filteredData = useMemo(() => {
    let filtered = accountingData;

    // Apply date range filter
    filtered = filtered.filter((row) => {
      return row.date >= dateRange.from && row.date <= dateRange.to;
    });

    // Apply pilot filter
    if (selectedPilots.length > 0) {
      filtered = filtered.filter((row) => selectedPilots.includes(row.pilot));
    }

    // Apply method filter
    if (selectedMethods.length > 0) {
      filtered = filtered.filter((row) => {
        const methodMap: Record<string, string> = {
          "Direct": "direkt",
          "Ticket": "ticket",
          "CCP": "ccp",
        };
        return selectedMethods.some(m => methodMap[m] === row.paymentMethod);
      });
    }

    // Apply driver filter
    if (selectedDrivers.length > 0) {
      filtered = filtered.filter((row) =>
        row.drivers.some((d) => selectedDrivers.includes(d))
      );
    }

    // Apply vehicle filter
    if (selectedVehicles.length > 0) {
      filtered = filtered.filter((row) =>
        row.vehicles.some((v) => selectedVehicles.includes(v))
      );
    }

    // Apply booking source filter
    if (selectedSources.length > 0) {
      filtered = filtered.filter((row) => selectedSources.includes(row.bookingSource));
    }

    // Apply search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((row) =>
        row.pilot.toLowerCase().includes(search) ||
        row.date.includes(search) ||
        row.time.includes(search) ||
        row.drivers.some(d => d.toLowerCase().includes(search)) ||
        row.vehicles.some(v => v.toLowerCase().includes(search)) ||
        row.bookingSource.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [accountingData, dateRange, selectedPilots, selectedMethods, selectedDrivers, selectedVehicles, selectedSources, searchTerm]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  // Format payment method for display
  const formatPaymentMethod = (method: string) => {
    switch (method) {
      case "direkt": return "Direct";
      case "ticket": return "Ticket";
      case "ccp": return "CCP";
      default: return method;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white mb-2">Accounting</h1>
        <p className="text-zinc-400 text-sm">
          Track pilot payments and flight operations
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        {/* Date Range Filter */}
        <div className="flex gap-3 items-center">
          <span className="text-sm text-zinc-400 min-w-[80px]">Date Range:</span>
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="bg-zinc-900 border-zinc-800 text-white w-40"
          />
          <span className="text-zinc-500">to</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="bg-zinc-900 border-zinc-800 text-white w-40"
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search by pilot, date, driver, or vehicle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-zinc-900 rounded-lg border border-zinc-800">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full animate-spin"></div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-800 border-b border-zinc-700">
              <tr>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Pilot</span>
                    <FilterDropdown
                      title="Filter Pilots"
                      options={filterOptions.pilots}
                      selectedValues={selectedPilots}
                      onChange={setSelectedPilots}
                      trigger={
                        <button className={`hover:text-white transition-colors ${selectedPilots.length > 0 ? 'text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-right px-4 py-3 text-zinc-300 font-medium">Payment</th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Method</span>
                    <FilterDropdown
                      title="Filter Methods"
                      options={filterOptions.methods}
                      selectedValues={selectedMethods}
                      onChange={setSelectedMethods}
                      trigger={
                        <button className={`hover:text-white transition-colors ${selectedMethods.length > 0 ? 'text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Source</span>
                    <FilterDropdown
                      title="Filter Sources"
                      options={filterOptions.sources}
                      selectedValues={selectedSources}
                      onChange={setSelectedSources}
                      trigger={
                        <button className={`hover:text-white transition-colors ${selectedSources.length > 0 ? 'text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-zinc-300 font-medium">Turn</th>
                <th className="text-center px-4 py-3 text-zinc-300 font-medium">Pax</th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Driver(s)</span>
                    <FilterDropdown
                      title="Filter Drivers"
                      options={filterOptions.drivers}
                      selectedValues={selectedDrivers}
                      onChange={setSelectedDrivers}
                      trigger={
                        <button className={`hover:text-white transition-colors ${selectedDrivers.length > 0 ? 'text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-zinc-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Vehicle(s)</span>
                    <FilterDropdown
                      title="Filter Vehicles"
                      options={filterOptions.vehicles}
                      selectedValues={selectedVehicles}
                      onChange={setSelectedVehicles}
                      trigger={
                        <button className={`hover:text-white transition-colors ${selectedVehicles.length > 0 ? 'text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-zinc-500">
                    <p>No records found matching your filters</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((row, index) => {
                  // Check if this is the first row of a turn
                  const isFirstRowOfTurn = index === 0 ||
                    (filteredData[index - 1].date !== row.date ||
                     filteredData[index - 1].time !== row.time);

                  return (
                    <tr
                      key={`${row.date}-${row.time}-${row.pilot}-${index}`}
                      className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-white">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-white">{row.time}</td>
                      <td className="px-4 py-3 text-white">{row.pilot}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">
                        {typeof row.payment === "number" ? row.payment.toFixed(2) : row.payment}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          row.paymentMethod === "direkt" ? "bg-green-900/30 text-green-400" :
                          row.paymentMethod === "ticket" ? "bg-blue-900/30 text-blue-400" :
                          "bg-purple-900/30 text-purple-400"
                        }`}>
                          {formatPaymentMethod(row.paymentMethod)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {row.bookingSource}
                      </td>
                      <td className="px-4 py-3 text-center text-white">
                        {isFirstRowOfTurn ? row.turn : ""}
                      </td>
                      <td className="px-4 py-3 text-center text-white">
                        {isFirstRowOfTurn ? row.pax : ""}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {isFirstRowOfTurn ? (row.drivers.length > 0 ? row.drivers.join(", ") : "-") : ""}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {isFirstRowOfTurn ? (row.vehicles.length > 0 ? row.vehicles.join(", ") : "-") : ""}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
