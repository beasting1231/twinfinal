import { useMemo, useState, useEffect } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { useBookings } from "../hooks/useBookings";
import { useDriverAssignments } from "../hooks/useDriverAssignments";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import { Download, Filter, Receipt, X, Copy, Check } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { FilterDropdown } from "./FilterDropdown";
import { doc, updateDoc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

interface AccountingRow {
  date: string;
  time: string;
  timeIndex: number;
  pilot: string;
  payment: number | string;
  paymentMethod: "direkt" | "ticket" | "ccp";
  turn: number;
  pax: number;
  drivers: string[];
  vehicles: string[];
  bookingSource: string;
  commission: number | null;
  commissionStatus: "paid" | "unpaid";
  bookingId: string | undefined;
  bookingIds: string[];
  receiptUrls: string[];
  officeNotes: string;
  notes: string;
  bookingDetails: string;
}

type EditingCell = {
  rowIndex: number;
  field: "pilot" | "payment" | "paymentMethod" | "bookingSource" | "commission" | "officeNotes" | "notes" | "driver" | "vehicle";
  value: string;
  bookingId: string;
  pilotName: string;
  // For driver/vehicle edits
  date?: string;
  timeIndex?: number;
};

export function Accounting() {
  const { bookings, loading, updateBooking } = useBookings();
  const { driverAssignments, loading: driversLoading, updateDriverAssignment, addDriverAssignment } = useDriverAssignments(); // Fetch all driver assignments
  const { currentUser } = useAuth();
  const { role } = useRole();

  // Filter states
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const today = startOfDay(new Date());
    return {
      from: format(today, "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  });
  const [selectedPilots, setSelectedPilots] = useState<string[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // Notes modal state
  const [notesModal, setNotesModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    isEditing: boolean;
    editValue: string;
    bookingId?: string;
    field?: "notes" | "officeNotes";
  }>({
    isOpen: false,
    title: "",
    content: "",
    isEditing: false,
    editValue: "",
  });

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  // Copied to clipboard feedback
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Time overrides state - maps date string to time index overrides
  const [timeOverridesByDate, setTimeOverridesByDate] = useState<Record<string, Record<number, string>>>({});

  // Additional time slots state - maps date string to array of additional time slots
  const [additionalSlotsByDate, setAdditionalSlotsByDate] = useState<Record<string, string[]>>({});

  // Pilot MWST status - maps pilot display name to MWST boolean
  const [pilotMwstMap, setPilotMwstMap] = useState<Record<string, boolean>>({});

  // Fetch pilot MWST data
  useEffect(() => {
    const fetchPilotMwst = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "userProfiles"));
        const mwstMap: Record<string, boolean> = {};
        querySnapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.displayName && data.role === "pilot") {
            mwstMap[data.displayName] = data.mwst || false;
          }
        });
        setPilotMwstMap(mwstMap);
      } catch (error) {
        console.error("Error fetching pilot MWST data:", error);
      }
    };
    fetchPilotMwst();
  }, []);

  // Fetch time overrides and additional slots for all unique dates in the bookings
  useEffect(() => {
    if (!bookings || bookings.length === 0) return;

    // Get unique dates from bookings
    const uniqueDates = [...new Set(bookings.map(b => b.date))];

    // Subscribe to time overrides for each date
    const unsubscribes = uniqueDates.map(dateStr => {
      const timeOverridesRef = doc(db, 'timeOverrides', dateStr);
      return onSnapshot(timeOverridesRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setTimeOverridesByDate(prev => ({
            ...prev,
            [dateStr]: data.overrides || {}
          }));
          setAdditionalSlotsByDate(prev => ({
            ...prev,
            [dateStr]: data.additionalSlots || []
          }));
        } else {
          setTimeOverridesByDate(prev => {
            const newState = { ...prev };
            delete newState[dateStr];
            return newState;
          });
          setAdditionalSlotsByDate(prev => {
            const newState = { ...prev };
            delete newState[dateStr];
            return newState;
          });
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [bookings]);

  // Normalize time to hh:mm format (strip seconds if present)
  const normalizeTime = (time: string): string => {
    // Match time patterns like "HH:MM:SS" or "HH:MM"
    const timeMatch = time.match(/^(\d{1,2}:\d{2})(:\d{2})?/);
    if (timeMatch) {
      return timeMatch[1]; // Return just HH:MM part
    }
    return time; // Return original if no match
  };

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

    // Calculate total pax and collect drivers/vehicles for each turn
    const totalPaxByTurn = new Map<string, number>();
    const driversByTurn = new Map<string, Set<string>>();
    const vehiclesByTurn = new Map<string, Set<string>>();

    sortedBookings.forEach((booking) => {
      const turnKey = `${booking.date}@${booking.timeIndex}`;

      // Count only pax that have pilots assigned (number of unique assigned pilots)
      const uniqueAssignedPilots = new Set(booking.assignedPilots?.filter(p => p && p.trim()) || []);
      const currentPax = totalPaxByTurn.get(turnKey) || 0;
      totalPaxByTurn.set(turnKey, currentPax + uniqueAssignedPilots.size);
    });

    // Collect drivers and vehicles from driverAssignments
    driverAssignments.forEach((assignment) => {
      const turnKey = `${assignment.date}@${assignment.timeIndex}`;

      // Collect drivers for this turn
      if (!driversByTurn.has(turnKey)) {
        driversByTurn.set(turnKey, new Set());
      }
      if (assignment.driver) driversByTurn.get(turnKey)!.add(assignment.driver);
      if (assignment.driver2) driversByTurn.get(turnKey)!.add(assignment.driver2);

      // Collect vehicles for this turn
      if (!vehiclesByTurn.has(turnKey)) {
        vehiclesByTurn.set(turnKey, new Set());
      }
      if (assignment.vehicle) vehiclesByTurn.get(turnKey)!.add(assignment.vehicle);
      if (assignment.vehicle2) vehiclesByTurn.get(turnKey)!.add(assignment.vehicle2);
    });

    // Create rows - one row per assigned pilot per booking
    const rows: AccountingRow[] = [];

    sortedBookings.forEach((booking) => {
      // Skip if no pilots assigned
      if (!booking.assignedPilots || booking.assignedPilots.length === 0) return;

      // Get booking details
      const dateObj = parseISO(booking.date);
      const timeSlotsForDate = getTimeSlotsByDate(dateObj);
      const dateOverrides = timeOverridesByDate[booking.date] || {};
      const additionalSlots = additionalSlotsByDate[booking.date] || [];

      // Handle additional time slots (timeIndex >= 1000)
      let timeSlot: string;
      let turnNumber: number;
      if (booking.timeIndex >= 1000) {
        // Additional slot - look up from additionalSlots array
        const additionalIndex = booking.timeIndex - 1000;
        const rawTimeSlot = additionalSlots[additionalIndex] || `Extra ${additionalIndex + 1}`;
        timeSlot = normalizeTime(rawTimeSlot);
        // For turn number, mark as "Extra" by using negative or special value
        // We'll display the actual time as the "turn" identifier
        turnNumber = -1; // Will be displayed as "Extra" in the UI
      } else {
        // Regular slot
        const defaultTimeSlot = timeSlotsForDate[booking.timeIndex] || `${booking.timeIndex}:00`;
        const rawTimeSlot = dateOverrides[booking.timeIndex] || defaultTimeSlot;
        timeSlot = normalizeTime(rawTimeSlot);
        turnNumber = booking.timeIndex + 1;
      }
      const turnKey = `${booking.date}@${booking.timeIndex}`;
      const totalPax = totalPaxByTurn.get(turnKey) || 0;

      // Get all drivers and vehicles for this turn
      const drivers = Array.from(driversByTurn.get(turnKey) || []);
      const vehicles = Array.from(vehiclesByTurn.get(turnKey) || []);

      // Create one row for each unique assigned pilot, filtering out empty values
      const uniquePilots = [...new Set(booking.assignedPilots.filter(p => p && p.trim()))];

      // Skip if no valid pilots after filtering
      if (uniquePilots.length === 0) return;

      uniquePilots.forEach((pilotName) => {
        // Try to find payment info for this pilot
        const pilotPayment = booking.pilotPayments?.find(p => p.pilotName === pilotName);

        // Extract receipt URLs from this pilot's payment data
        const receiptUrls = pilotPayment?.receiptFiles
          ?.map(file => file.url || file.data)
          .filter((url): url is string => !!url) || [];

        rows.push({
          date: booking.date,
          time: timeSlot,
          timeIndex: booking.timeIndex,
          pilot: pilotName,
          payment: pilotPayment?.amount || "-",
          paymentMethod: pilotPayment?.paymentMethod || "direkt",
          turn: turnNumber,
          pax: totalPax,
          drivers,
          vehicles,
          bookingSource: booking.bookingSource || "Unknown",
          commission: booking.commission || null,
          commissionStatus: booking.commissionStatus || "unpaid",
          bookingId: booking.id,
          bookingIds: booking.id ? [booking.id] : [],
          receiptUrls,
          officeNotes: booking.officeNotes || "",
          notes: booking.notes || "",
          bookingDetails: [
            booking.customerName && `Name: ${booking.customerName}`,
            booking.email && `Email: ${booking.email}`,
            booking.phoneNumber && `Phone: ${booking.phoneNumber}`,
          ].filter(Boolean).join("\n") || "",
        });
      });
    });

    return rows;
  }, [bookings, driverAssignments, timeOverridesByDate, additionalSlotsByDate]);

  // Filter accounting data for pilots - they should only see their own rows
  const visibleAccountingData = useMemo(() => {
    if (role === "pilot" && currentUser?.displayName) {
      return accountingData.filter(row => row.pilot === currentUser.displayName);
    }
    return accountingData;
  }, [accountingData, role, currentUser]);

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    const pilots = new Set<string>();
    const drivers = new Set<string>();
    const vehicles = new Set<string>();
    const sources = new Set<string>();

    visibleAccountingData.forEach((row) => {
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
  }, [visibleAccountingData]);

  // Filter rows by all filters and search term
  const filteredData = useMemo(() => {
    let filtered = visibleAccountingData;

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

    return filtered;
  }, [visibleAccountingData, dateRange, selectedPilots, selectedMethods, selectedDrivers, selectedVehicles, selectedSources]);

  // Calculate total pilot's invoice sum
  const totalPilotsInvoice = useMemo(() => {
    return filteredData.reduce((sum, row) => {
      if (typeof row.payment !== "number") return sum;
      // Base calculation: negative stays same, positive subtracts 103
      let invoice = row.payment < 0 ? row.payment : row.payment - 103;
      // If pilot has MWST enabled, apply additional deduction
      if (pilotMwstMap[row.pilot]) {
        invoice -= invoice > 0 ? 6 : 3;
      }
      return sum + invoice;
    }, 0);
  }, [filteredData, pilotMwstMap]);

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

  // Update commission status
  const updateCommissionStatus = async (bookingId: string, newStatus: "paid" | "unpaid") => {
    try {
      const bookingRef = doc(db, "bookings", bookingId);
      await updateDoc(bookingRef, {
        commissionStatus: newStatus
      });
    } catch (error) {
      console.error("Error updating commission status:", error);
    }
  };

  // Save edited cell value
  const saveEditedCell = async () => {
    if (!editingCell || !editingCell.bookingId) return;

    try {
      const booking = bookings.find(b => b.id === editingCell.bookingId);
      if (!booking) return;

      const updates: Record<string, unknown> = {};

      switch (editingCell.field) {
        case "payment": {
          // Update pilotPayments array for this specific pilot
          const pilotPayments = [...(booking.pilotPayments || [])];
          const pilotIndex = pilotPayments.findIndex(p => p.pilotName === editingCell.pilotName);
          const amount = parseFloat(editingCell.value) || 0;

          if (pilotIndex >= 0) {
            pilotPayments[pilotIndex] = { ...pilotPayments[pilotIndex], amount };
          } else {
            pilotPayments.push({ pilotName: editingCell.pilotName, amount, paymentMethod: "direkt" });
          }
          updates.pilotPayments = pilotPayments;
          break;
        }
        case "paymentMethod": {
          // Update pilotPayments array for this specific pilot
          const pilotPayments = [...(booking.pilotPayments || [])];
          const pilotIndex = pilotPayments.findIndex(p => p.pilotName === editingCell.pilotName);
          const paymentMethod = editingCell.value as "direkt" | "ticket" | "ccp";

          if (pilotIndex >= 0) {
            pilotPayments[pilotIndex] = { ...pilotPayments[pilotIndex], paymentMethod };
          } else {
            pilotPayments.push({ pilotName: editingCell.pilotName, amount: 0, paymentMethod });
          }
          updates.pilotPayments = pilotPayments;
          break;
        }
        case "bookingSource":
          updates.bookingSource = editingCell.value;
          break;
        case "commission":
          updates.commission = parseFloat(editingCell.value) || 0;
          break;
        case "notes":
          updates.notes = editingCell.value;
          break;
        case "officeNotes":
          updates.officeNotes = editingCell.value;
          break;
      }

      await updateBooking(editingCell.bookingId, updates);
    } catch (error) {
      console.error("Error saving edit:", error);
    }

    setEditingCell(null);
  };

  // Handle key press in edit mode
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEditedCell();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  // Save payment method directly (to avoid stale state issues)
  const savePaymentMethod = async (bookingId: string, pilotName: string, newMethod: "direkt" | "ticket" | "ccp") => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      const pilotPayments = [...(booking.pilotPayments || [])];
      const pilotIndex = pilotPayments.findIndex(p => p.pilotName === pilotName);

      if (pilotIndex >= 0) {
        pilotPayments[pilotIndex] = { ...pilotPayments[pilotIndex], paymentMethod: newMethod };
      } else {
        pilotPayments.push({ pilotName, amount: 0, paymentMethod: newMethod });
      }

      await updateBooking(bookingId, { pilotPayments });
    } catch (error) {
      console.error("Error saving payment method:", error);
    }
    setEditingCell(null);
  };

  // Save notes from modal
  const saveNotesFromModal = async () => {
    if (!notesModal.bookingId || !notesModal.field) return;

    try {
      const updates: Record<string, string> = {};
      updates[notesModal.field] = notesModal.editValue;
      await updateBooking(notesModal.bookingId, updates);
    } catch (error) {
      console.error("Error saving notes:", error);
    }

    setNotesModal({ isOpen: false, title: "", content: "", isEditing: false, editValue: "" });
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(label);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Save driver or vehicle assignment
  const saveDriverOrVehicle = async (date: string, timeIndex: number, field: "driver" | "vehicle", value: string) => {
    try {
      // Find existing assignment for this date and timeIndex
      const existingAssignment = driverAssignments.find(
        a => a.date === date && a.timeIndex === timeIndex
      );

      if (existingAssignment && existingAssignment.id) {
        // Update existing assignment
        await updateDriverAssignment(existingAssignment.id, { [field]: value || undefined });
      } else if (value) {
        // Create new assignment only if there's a value
        await addDriverAssignment({
          date,
          timeIndex,
          [field]: value,
        });
      }
    } catch (error) {
      console.error("Error saving driver/vehicle:", error);
    }
    setEditingCell(null);
  };

  // Export to CSV
  const exportToCSV = () => {
    // Create CSV headers based on role
    const headers = role === "pilot"
      ? ["Flight #", "Date", "Time", "Pilot", "Payment", "Method", "Source"]
      : ["Flight #", "Pilot's Invoice", "Date", "Time", "Pilot", "Payment", "Method", "Source", "Turn", "Pax", "Driver(s)", "Vehicle(s)", "Commission", "Comm. Status", "Office notes", "Additional notes", "Booking details"];

    // Create CSV rows from filtered data
    const csvRows = [headers.join(",")];

    filteredData.forEach((row, index) => {
      const isFirstRowOfTurn = index === 0 ||
        (filteredData[index - 1].date !== row.date ||
         filteredData[index - 1].time !== row.time);

      // Calculate pilot's invoice (same calculation as in the UI)
      const calculatePilotInvoice = () => {
        if (typeof row.payment !== "number") return "-";
        // Base calculation: negative stays same, positive subtracts 103
        let invoice = row.payment < 0 ? row.payment : row.payment - 103;
        // If pilot has MWST enabled, apply additional deduction
        if (pilotMwstMap[row.pilot]) {
          invoice -= invoice > 0 ? 6 : 3;
        }
        return invoice.toFixed(2);
      };

      const rowData = role === "pilot"
        ? [
            index + 1,
            formatDate(row.date),
            row.time,
            row.pilot,
            typeof row.payment === "number" ? row.payment.toFixed(2) : row.payment,
            formatPaymentMethod(row.paymentMethod),
            row.bookingSource,
          ]
        : [
            index + 1,
            calculatePilotInvoice(),
            formatDate(row.date),
            row.time,
            row.pilot,
            typeof row.payment === "number" ? row.payment.toFixed(2) : row.payment,
            formatPaymentMethod(row.paymentMethod),
            row.bookingSource,
            isFirstRowOfTurn ? (row.turn === -1 ? "Extra" : row.turn) : "",
            isFirstRowOfTurn ? row.pax : "",
            isFirstRowOfTurn ? (row.drivers.length > 0 ? row.drivers.join("; ") : "-") : "",
            isFirstRowOfTurn ? (row.vehicles.length > 0 ? row.vehicles.join("; ") : "-") : "",
            row.commission !== null ? row.commission.toFixed(2) : "-",
            row.commission !== null ? (row.commissionStatus === "paid" ? "Paid" : "Unpaid") : "-",
            row.officeNotes || "-",
            row.notes || "-",
            row.bookingDetails.replace(/\n/g, "; ") || "-",
          ];

      csvRows.push(rowData.map(field => `"${field}"`).join(","));
    });

    // Add total row for non-pilot users
    if (role !== "pilot") {
      const totalRow = ["", totalPilotsInvoice.toFixed(2), "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
      csvRows.push(totalRow.map(field => `"${field}"`).join(","));
    }

    // Create blob and download
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `accounting-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Accounting</h1>
        <Button
          onClick={exportToCSV}
          variant="outline"
          className="border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        {/* Date Range Filter */}
        <div className="flex gap-3 items-center">
          <span className="text-sm text-gray-600 dark:text-zinc-400 min-w-[80px]">Date Range:</span>
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white w-40 h-10 !text-sm [&::-webkit-date-and-time-value]:!text-sm dark:[color-scheme:dark] [color-scheme:light]"
            style={{
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
              fontSize: '14px',
              lineHeight: '1.5',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem'
            } as React.CSSProperties}
          />
          <span className="text-gray-500 dark:text-zinc-500">to</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white w-40 h-10 !text-sm [&::-webkit-date-and-time-value]:!text-sm dark:[color-scheme:dark] [color-scheme:light]"
            style={{
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
              fontSize: '14px',
              lineHeight: '1.5',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem'
            } as React.CSSProperties}
          />
          <span className="text-sm text-gray-600 dark:text-zinc-400 ml-6">
            Total flights: <span className="text-gray-900 dark:text-white font-medium">{filteredData.length}</span>
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800">
        {(loading || driversLoading) ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-4 border-gray-300 dark:border-zinc-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin"></div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
              <tr>
                <th className="text-center px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap w-12">#</th>
                {role !== "pilot" && (
                  <th className="text-right px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Pilot's Invoice</th>
                )}
                <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Time</th>
                <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>Pilot</span>
                    <FilterDropdown
                      title="Filter Pilots"
                      options={filterOptions.pilots}
                      selectedValues={selectedPilots}
                      onChange={setSelectedPilots}
                      trigger={
                        <button className={`hover:text-gray-900 dark:hover:text-white transition-colors ${selectedPilots.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-right px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Payment</th>
                <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>Method</span>
                    <FilterDropdown
                      title="Filter Methods"
                      options={filterOptions.methods}
                      selectedValues={selectedMethods}
                      onChange={setSelectedMethods}
                      trigger={
                        <button className={`hover:text-gray-900 dark:hover:text-white transition-colors ${selectedMethods.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>Source</span>
                    <FilterDropdown
                      title="Filter Sources"
                      options={filterOptions.sources}
                      selectedValues={selectedSources}
                      onChange={setSelectedSources}
                      trigger={
                        <button className={`hover:text-gray-900 dark:hover:text-white transition-colors ${selectedSources.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                          <Filter className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                </th>
                {role !== "pilot" && (
                  <>
                    <th className="text-center px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Turn</th>
                    <th className="text-center px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Pax</th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>Driver(s)</span>
                        <FilterDropdown
                          title="Filter Drivers"
                          options={filterOptions.drivers}
                          selectedValues={selectedDrivers}
                          onChange={setSelectedDrivers}
                          trigger={
                            <button className={`hover:text-gray-900 dark:hover:text-white transition-colors ${selectedDrivers.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                              <Filter className="h-4 w-4" />
                            </button>
                          }
                        />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>Vehicle(s)</span>
                        <FilterDropdown
                          title="Filter Vehicles"
                          options={filterOptions.vehicles}
                          selectedValues={selectedVehicles}
                          onChange={setSelectedVehicles}
                          trigger={
                            <button className={`hover:text-gray-900 dark:hover:text-white transition-colors ${selectedVehicles.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                              <Filter className="h-4 w-4" />
                            </button>
                          }
                        />
                      </div>
                    </th>
                    <th className="text-right px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Commission</th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Comm. Status</th>
                    <th className="text-center px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Receipt</th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Office notes</th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Additional notes</th>
                    <th className="text-left px-4 py-3 text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">Booking details</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={role === "pilot" ? 7 : 17} className="px-4 py-12 text-center text-gray-500 dark:text-zinc-500">
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
                      className="border-b border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-center text-gray-500 dark:text-zinc-500 whitespace-nowrap w-12">{index + 1}</td>
                      {role !== "pilot" && (
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white whitespace-nowrap">
                          {typeof row.payment === "number"
                            ? (() => {
                                // Base calculation: negative stays same, positive subtracts 103
                                let invoice = row.payment < 0 ? row.payment : row.payment - 103;
                                // If pilot has MWST enabled, apply additional deduction
                                if (pilotMwstMap[row.pilot]) {
                                  invoice -= invoice > 0 ? 6 : 3;
                                }
                                return invoice.toFixed(2);
                              })()
                            : "-"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-900 dark:text-white whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white whitespace-nowrap">{row.time}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white whitespace-nowrap">{row.pilot}</td>
                      <td
                        className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                        onDoubleClick={() => row.bookingId && setEditingCell({
                          rowIndex: index,
                          field: "payment",
                          value: typeof row.payment === "number" ? row.payment.toString() : "",
                          bookingId: row.bookingId,
                          pilotName: row.pilot,
                        })}
                      >
                        {editingCell?.rowIndex === index && editingCell?.field === "payment" ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={handleEditKeyDown}
                            onBlur={saveEditedCell}
                            autoFocus
                            className="w-20 px-1 py-0.5 text-right text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                          />
                        ) : (
                          typeof row.payment === "number" ? row.payment.toFixed(2) : row.payment
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-gray-700 dark:text-zinc-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                        onDoubleClick={() => row.bookingId && setEditingCell({
                          rowIndex: index,
                          field: "paymentMethod",
                          value: row.paymentMethod,
                          bookingId: row.bookingId,
                          pilotName: row.pilot,
                        })}
                      >
                        {editingCell?.rowIndex === index && editingCell?.field === "paymentMethod" ? (
                          <select
                            value={editingCell.value}
                            onChange={(e) => {
                              const newMethod = e.target.value as "direkt" | "ticket" | "ccp";
                              if (row.bookingId) {
                                savePaymentMethod(row.bookingId, row.pilot, newMethod);
                              }
                            }}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                            className="px-2 py-1 text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                          >
                            <option value="direkt">Direct</option>
                            <option value="ticket">Ticket</option>
                            <option value="ccp">CCP</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            row.paymentMethod === "direkt" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                            row.paymentMethod === "ticket" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                            "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                          }`}>
                            {formatPaymentMethod(row.paymentMethod)}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-gray-700 dark:text-zinc-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                        onDoubleClick={() => row.bookingId && setEditingCell({
                          rowIndex: index,
                          field: "bookingSource",
                          value: row.bookingSource,
                          bookingId: row.bookingId,
                          pilotName: row.pilot,
                        })}
                      >
                        {editingCell?.rowIndex === index && editingCell?.field === "bookingSource" ? (
                          <input
                            type="text"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={handleEditKeyDown}
                            onBlur={saveEditedCell}
                            autoFocus
                            className="w-24 px-1 py-0.5 text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                          />
                        ) : (
                          row.bookingSource
                        )}
                      </td>
                      {role !== "pilot" && (
                        <>
                          <td className="px-4 py-3 text-center text-gray-900 dark:text-white whitespace-nowrap">
                            {isFirstRowOfTurn ? (row.turn === -1 ? "Extra" : row.turn) : ""}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-900 dark:text-white whitespace-nowrap">
                            {isFirstRowOfTurn ? row.pax : ""}
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700 dark:text-zinc-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onDoubleClick={() => isFirstRowOfTurn && setEditingCell({
                              rowIndex: index,
                              field: "driver",
                              value: row.drivers.length > 0 ? row.drivers[0] : "",
                              bookingId: row.bookingId || "",
                              pilotName: row.pilot,
                              date: row.date,
                              timeIndex: row.timeIndex,
                            })}
                          >
                            {editingCell?.rowIndex === index && editingCell?.field === "driver" ? (
                              <>
                                <input
                                  type="text"
                                  list="driver-options"
                                  value={editingCell.value}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && editingCell.date !== undefined && editingCell.timeIndex !== undefined) {
                                      saveDriverOrVehicle(editingCell.date, editingCell.timeIndex, "driver", editingCell.value);
                                    } else if (e.key === "Escape") {
                                      setEditingCell(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingCell.date !== undefined && editingCell.timeIndex !== undefined) {
                                      saveDriverOrVehicle(editingCell.date, editingCell.timeIndex, "driver", editingCell.value);
                                    }
                                  }}
                                  autoFocus
                                  className="w-24 px-1 py-0.5 text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                                  placeholder="Select or type..."
                                />
                                <datalist id="driver-options">
                                  {filterOptions.drivers.map((d) => (
                                    <option key={d} value={d} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              isFirstRowOfTurn ? (row.drivers.length > 0 ? row.drivers.join(", ") : "-") : ""
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700 dark:text-zinc-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onDoubleClick={() => isFirstRowOfTurn && setEditingCell({
                              rowIndex: index,
                              field: "vehicle",
                              value: row.vehicles.length > 0 ? row.vehicles[0] : "",
                              bookingId: row.bookingId || "",
                              pilotName: row.pilot,
                              date: row.date,
                              timeIndex: row.timeIndex,
                            })}
                          >
                            {editingCell?.rowIndex === index && editingCell?.field === "vehicle" ? (
                              <>
                                <input
                                  type="text"
                                  list="vehicle-options"
                                  value={editingCell.value}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && editingCell.date !== undefined && editingCell.timeIndex !== undefined) {
                                      saveDriverOrVehicle(editingCell.date, editingCell.timeIndex, "vehicle", editingCell.value);
                                    } else if (e.key === "Escape") {
                                      setEditingCell(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingCell.date !== undefined && editingCell.timeIndex !== undefined) {
                                      saveDriverOrVehicle(editingCell.date, editingCell.timeIndex, "vehicle", editingCell.value);
                                    }
                                  }}
                                  autoFocus
                                  className="w-24 px-1 py-0.5 text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                                  placeholder="Select or type..."
                                />
                                <datalist id="vehicle-options">
                                  {filterOptions.vehicles.map((v) => (
                                    <option key={v} value={v} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              isFirstRowOfTurn ? (row.vehicles.length > 0 ? row.vehicles.join(", ") : "-") : ""
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-right text-gray-900 dark:text-white whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onDoubleClick={() => row.bookingId && setEditingCell({
                              rowIndex: index,
                              field: "commission",
                              value: row.commission !== null ? row.commission.toString() : "",
                              bookingId: row.bookingId,
                              pilotName: row.pilot,
                            })}
                          >
                            {editingCell?.rowIndex === index && editingCell?.field === "commission" ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                onKeyDown={handleEditKeyDown}
                                onBlur={saveEditedCell}
                                autoFocus
                                className="w-20 px-1 py-0.5 text-right text-sm border border-blue-500 rounded bg-white dark:bg-zinc-800 focus:outline-none"
                              />
                            ) : (
                              row.commission !== null ? row.commission.toFixed(2) : "-"
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.commission !== null ? (
                              row.bookingId && (role === "admin" || role === "agency" || role === "driver") ? (
                                <select
                                  value={row.commissionStatus}
                                  onChange={(e) => updateCommissionStatus(row.bookingId!, e.target.value as "paid" | "unpaid")}
                                  className={`px-2 py-1 rounded text-xs font-medium border-0 ${
                                    row.commissionStatus === "paid"
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                  }`}
                                >
                                  <option value="unpaid">Unpaid</option>
                                  <option value="paid">Paid</option>
                                </select>
                              ) : (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  row.commissionStatus === "paid"
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                }`}>
                                  {row.commissionStatus === "paid" ? "Paid" : "Unpaid"}
                                </span>
                              )
                            ) : (
                              <span className="text-gray-500 dark:text-zinc-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {row.receiptUrls && row.receiptUrls.length > 0 ? (
                              <div className="flex gap-1 justify-center">
                                {row.receiptUrls.map((url, idx) => (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                    title={`View receipt ${idx + 1}`}
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-500 dark:text-zinc-500">-</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700 dark:text-zinc-300 max-w-[150px] cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onClick={() => row.officeNotes && setNotesModal({
                              isOpen: true,
                              title: "Office notes",
                              content: row.officeNotes,
                              isEditing: false,
                              editValue: row.officeNotes,
                              bookingId: row.bookingId,
                              field: "officeNotes",
                            })}
                            onDoubleClick={() => row.bookingId && setNotesModal({
                              isOpen: true,
                              title: "Office notes",
                              content: row.officeNotes || "",
                              isEditing: true,
                              editValue: row.officeNotes || "",
                              bookingId: row.bookingId,
                              field: "officeNotes",
                            })}
                          >
                            {row.officeNotes ? (
                              <span className="truncate block w-full" title="Click to view, double-click to edit">
                                {row.officeNotes}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-zinc-500">-</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700 dark:text-zinc-300 max-w-[150px] cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onClick={() => row.notes && setNotesModal({
                              isOpen: true,
                              title: "Additional notes",
                              content: row.notes,
                              isEditing: false,
                              editValue: row.notes,
                              bookingId: row.bookingId,
                              field: "notes",
                            })}
                            onDoubleClick={() => row.bookingId && setNotesModal({
                              isOpen: true,
                              title: "Additional notes",
                              content: row.notes || "",
                              isEditing: true,
                              editValue: row.notes || "",
                              bookingId: row.bookingId,
                              field: "notes",
                            })}
                          >
                            {row.notes ? (
                              <span className="truncate block w-full" title="Click to view, double-click to edit">
                                {row.notes}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-zinc-500">-</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-gray-700 dark:text-zinc-300 max-w-[150px] cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/50"
                            onClick={() => row.bookingDetails && setNotesModal({
                              isOpen: true,
                              title: "Booking details",
                              content: row.bookingDetails,
                              isEditing: false,
                              editValue: row.bookingDetails,
                            })}
                          >
                            {row.bookingDetails ? (
                              <span className="truncate block w-full" title="Click to view">
                                {row.bookingDetails.split("\n")[0]}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-zinc-500">-</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Summary Row */}
      {role !== "pilot" && (
        <div className="mt-4 bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 px-4 py-3">
          <div className="flex items-center">
            <div className="w-12 text-center"></div>
            <div className="w-24 text-right text-gray-900 dark:text-white font-bold">
              {totalPilotsInvoice.toFixed(2)}
            </div>
            <div className="flex-1"></div>
            <div className="text-gray-900 dark:text-white font-medium whitespace-nowrap">
              Total flights: <span className="font-bold">{filteredData.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setNotesModal({ isOpen: false, title: "", content: "", isEditing: false, editValue: "" })}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-700">
              <h3 className="font-medium text-gray-900 dark:text-white">{notesModal.title}</h3>
              <button
                onClick={() => setNotesModal({ isOpen: false, title: "", content: "", isEditing: false, editValue: "" })}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {notesModal.isEditing ? (
                <textarea
                  value={notesModal.editValue}
                  onChange={(e) => setNotesModal({ ...notesModal, editValue: e.target.value })}
                  autoFocus
                  className="w-full h-40 px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Enter notes..."
                />
              ) : notesModal.title === "Booking details" ? (
                <div className="space-y-2">
                  {notesModal.content.split("\n").map((line, idx) => {
                    const [label, ...valueParts] = line.split(": ");
                    const value = valueParts.join(": ");
                    if (!value) return null;
                    return (
                      <button
                        key={idx}
                        onClick={() => copyToClipboard(value, label)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-left"
                      >
                        <div>
                          <span className="text-xs text-gray-500 dark:text-zinc-400 block">{label}</span>
                          <span className="text-gray-900 dark:text-white">{value}</span>
                        </div>
                        {copiedItem === label ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  <p className="text-xs text-gray-500 dark:text-zinc-500 text-center mt-3">Click to copy</p>
                </div>
              ) : (
                <p className="text-gray-700 dark:text-zinc-300 whitespace-pre-wrap">{notesModal.content}</p>
              )}
            </div>
            {notesModal.isEditing && (
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-zinc-700">
                <button
                  onClick={() => setNotesModal({ isOpen: false, title: "", content: "", isEditing: false, editValue: "" })}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotesFromModal}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            )}
            {!notesModal.isEditing && notesModal.bookingId && (
              <div className="flex justify-end px-4 py-3 border-t border-gray-200 dark:border-zinc-700">
                <button
                  onClick={() => setNotesModal({ ...notesModal, isEditing: true })}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
