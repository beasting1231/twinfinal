import { useState, useMemo, useEffect } from "react";
import { collection, addDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { CountryCodeSelect } from "./CountryCodeSelect";
import { Calendar } from "lucide-react";
import { format, parse } from "date-fns";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import type { Booking, Pilot, UserProfile } from "../types/index";

export function BookingRequestForm() {
  const [formData, setFormData] = useState({
    customerName: "",
    email: "",
    phone: "",
    phoneCountryCode: "+41",
    date: format(new Date(), "yyyy-MM-dd"),
    timeIndex: "",
    numberOfPeople: 1,
    meetingPoint: "",
    flightType: "sensational" as "sensational" | "classic" | "early bird",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // State for real-time data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allPilots, setAllPilots] = useState<Pilot[]>([]);
  const [pilotAvailability, setPilotAvailability] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  // Parse the selected date
  const selectedDate = useMemo(() => {
    try {
      return parse(formData.date, "yyyy-MM-dd", new Date());
    } catch {
      return new Date();
    }
  }, [formData.date]);

  // Get time slots for the selected date
  const timeSlots = useMemo(() => getTimeSlotsByDate(selectedDate), [selectedDate]);

  // Fetch bookings for the selected date
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const bookingsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as Booking));
        setBookings(bookingsData);
      },
      (error) => console.error("Error fetching bookings:", error)
    );
    return () => unsubscribe();
  }, []);

  // Fetch pilots
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "userProfiles"),
      (snapshot) => {
        const pilotsData = snapshot.docs
          .map((doc) => {
            const data = doc.data() as UserProfile;
            return {
              uid: data.uid,
              displayName: data.displayName,
              email: data.email,
              femalePilot: data.femalePilot,
              priority: data.priority,
            } as Pilot;
          })
          .sort((a, b) => {
            const aPriority = a.priority ?? 999999;
            const bPriority = b.priority ?? 999999;
            if (aPriority !== bPriority) {
              return aPriority - bPriority;
            }
            return a.displayName.localeCompare(b.displayName);
          });
        setAllPilots(pilotsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching pilots:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch availability for selected date
  useEffect(() => {
    const dateString = formData.date;
    const q = query(
      collection(db, "availability"),
      where("date", "==", dateString)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const availabilityMap = new Map<string, Set<string>>();

        // Availability records only exist for time slots where pilots ARE available
        // If a record exists, the pilot is available. If no record, they're not available.
        // This matches how usePilots works.
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const userId = data.userId;
          const timeSlot = data.timeSlot;

          if (!availabilityMap.has(userId)) {
            availabilityMap.set(userId, new Set());
          }
          availabilityMap.get(userId)!.add(timeSlot);
        });

        setPilotAvailability(availabilityMap);
      },
      (error) => console.error("Error fetching availability:", error)
    );

    return () => unsubscribe();
  }, [formData.date]);

  // Filter bookings for selected date
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => b.date === formData.date);
  }, [bookings, formData.date]);

  // Check if pilot is available for time slot
  // Matches the logic from BookingDetailsModal
  const isPilotAvailableForTimeSlot = (pilotUid: string, timeSlot: string): boolean => {
    const slots = pilotAvailability.get(pilotUid);
    return slots ? slots.has(timeSlot) : false;
  };

  // Calculate available spots for each time slot
  const timeSlotAvailability = useMemo(() => {
    return timeSlots.map((timeSlot, timeIndex) => {
      // Count how many pilots are available at this time
      const availablePilots = allPilots.filter((pilot) =>
        isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
      );

      // Count how many spots are taken by bookings at this time
      const bookingsAtTime = filteredBookings.filter((b) => b.timeIndex === timeIndex);
      const spotsTaken = bookingsAtTime.reduce((sum, b) => sum + (b.numberOfPeople || 0), 0);

      const availableSpots = availablePilots.length - spotsTaken;

      return {
        timeSlot,
        timeIndex,
        availableSpots: Math.max(0, availableSpots),
      };
    });
  }, [timeSlots, allPilots, filteredBookings, pilotAvailability]);

  // Reset timeIndex when date changes
  useEffect(() => {
    setFormData((prev) => ({ ...prev, timeIndex: "" }));
  }, [formData.date]);

  // Reset numberOfPeople if selected number is not available for current time slot
  useEffect(() => {
    if (formData.timeIndex) {
      const selectedTimeSlot = timeSlotAvailability.find(
        slot => slot.timeIndex.toString() === formData.timeIndex
      );
      const availableCount = selectedTimeSlot?.availableSpots ?? 0;

      // If the currently selected number of people exceeds available spots, reset it
      if (formData.numberOfPeople > availableCount) {
        setFormData((prev) => ({ ...prev, numberOfPeople: 1 }));
      }
    }
  }, [formData.timeIndex, formData.date, timeSlotAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      // Convert timeIndex to time string
      const selectedTimeSlot = timeSlots[parseInt(formData.timeIndex)];

      // Combine country code and phone number
      const fullPhoneNumber = formData.phone
        ? `${formData.phoneCountryCode} ${formData.phone}`.trim()
        : "";

      await addDoc(collection(db, "bookingRequests"), {
        customerName: formData.customerName,
        email: formData.email,
        phone: fullPhoneNumber,
        phoneCountryCode: formData.phoneCountryCode,
        date: formData.date,
        time: selectedTimeSlot,
        timeIndex: parseInt(formData.timeIndex),
        numberOfPeople: Number(formData.numberOfPeople),
        meetingPoint: formData.meetingPoint,
        flightType: formData.flightType,
        notes: formData.notes,
        status: "pending",
        createdAt: new Date(),
      });

      setMessage({
        type: "success",
        text: "Booking request submitted successfully! We'll get back to you soon.",
      });

      // Reset form
      setFormData({
        customerName: "",
        email: "",
        phone: "",
        phoneCountryCode: "+41",
        date: format(new Date(), "yyyy-MM-dd"),
        timeIndex: "",
        numberOfPeople: 1,
        meetingPoint: "",
        flightType: "sensational",
        notes: "",
      });
    } catch (error) {
      console.error("Error submitting booking request:", error);
      setMessage({
        type: "error",
        text: "Failed to submit booking request. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-zinc-950 dark flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-zinc-900 rounded-lg border border-zinc-800 p-8">
        <h1 className="text-3xl font-bold text-white mb-2">Book a Flight</h1>
        <p className="text-zinc-400 mb-8">Fill out the form below to request a booking.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Name */}
          <div className="space-y-2">
            <label htmlFor="customerName" className="text-sm font-medium text-zinc-200">
              Name *
            </label>
            <Input
              id="customerName"
              name="customerName"
              type="text"
              value={formData.customerName}
              onChange={handleChange}
              required
              placeholder="Your full name"
              className="text-white"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-zinc-200">
              Email *
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="your@email.com"
              className="text-white"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-zinc-200">
              Phone Number
            </label>
            <div className="flex gap-2">
              <CountryCodeSelect
                value={formData.phoneCountryCode}
                onChange={(code) => setFormData((prev) => ({ ...prev, phoneCountryCode: code }))}
              />
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="555 000 0000"
                className="text-white flex-1"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <label htmlFor="date" className="text-sm font-medium text-zinc-200">
              Date *
            </label>
            <div className="relative">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 z-10 cursor-pointer"
                onClick={() => {
                  const dateInput = document.getElementById('date') as HTMLInputElement;
                  dateInput?.showPicker?.();
                }}
              >
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <Input
                id="date"
                name="date"
                type="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="text-white pl-11 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:opacity-0"
                style={{
                  colorScheme: 'dark'
                }}
              />
            </div>
          </div>

          {/* Time Slot Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">
              Time Slot *
            </label>
            {loading ? (
              <div className="text-zinc-400 text-sm">Loading availability...</div>
            ) : (
              <Select
                value={formData.timeIndex}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, timeIndex: value }))}
                required
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue placeholder="Select a time slot" />
                </SelectTrigger>
                <SelectContent className="min-w-[280px]">
                  {timeSlotAvailability.map((slot) => {
                    const availableCount = slot.availableSpots;
                    const requiredPilots = formData.numberOfPeople;
                    const isDisabled = availableCount < requiredPilots;

                    return (
                      <SelectItem
                        key={slot.timeIndex}
                        value={slot.timeIndex.toString()}
                        disabled={isDisabled}
                        className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="flex-shrink-0">{slot.timeSlot}</span>
                          <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                            availableCount === 0
                              ? 'bg-red-900/50 text-red-400'
                              : 'bg-green-900/50 text-green-400'
                          }`}>
                            {availableCount} available
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Number of People */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">
              Number of People *
            </label>
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                  // Disable all if no time selected
                  if (!formData.timeIndex) {
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={true}
                        className="flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors bg-zinc-900 text-zinc-600 cursor-not-allowed"
                      >
                        {num}
                      </button>
                    );
                  }

                  // Check if there's enough availability for this number
                  const selectedTimeSlot = timeSlotAvailability.find(
                    slot => slot.timeIndex.toString() === formData.timeIndex
                  );
                  const availableCount = selectedTimeSlot?.availableSpots ?? 0;
                  const isDisabled = availableCount < num;

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => !isDisabled && setFormData((prev) => ({ ...prev, numberOfPeople: num }))}
                      disabled={isDisabled}
                      className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                        formData.numberOfPeople === num
                          ? "bg-white text-black"
                          : isDisabled
                          ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                          : "bg-zinc-800 text-white hover:bg-zinc-700"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Meeting Point */}
          <div className="space-y-2">
            <label htmlFor="meetingPoint" className="text-sm font-medium text-zinc-200">
              Meeting Point *
            </label>
            <Select
              value={formData.meetingPoint}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, meetingPoint: value }))}
              required
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                <SelectValue placeholder="Select meeting point" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Meet at our base near the landing field in the centre">
                  Meet at our base near the landing field in the centre
                </SelectItem>
                <SelectItem value="Train Station Interlaken Ost (Outside BIG coop supermarket)">
                  Train Station Interlaken Ost (Outside BIG coop supermarket)
                </SelectItem>
                <SelectItem value="Mattenhof Resort (Free Parking)">
                  Mattenhof Resort (Free Parking)
                </SelectItem>
                <SelectItem value="Other meeting point in or near Interlaken">
                  Other meeting point in or near Interlaken
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Flight Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-200">
              Flight Type *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { type: "sensational", price: "CHF 180" },
                { type: "classic", price: "CHF 170" },
                { type: "early bird", price: "CHF 180" }
              ] as const).map(({ type, price }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, flightType: type }))}
                  className={`px-3 py-3 rounded-lg font-medium transition-colors ${
                    formData.flightType === type
                      ? "bg-white text-black"
                      : "bg-zinc-800 text-white hover:bg-zinc-700"
                  }`}
                >
                  <div className="capitalize text-sm">{type}</div>
                  <div className="text-xs mt-1 opacity-80">{price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium text-zinc-200">
              Additional Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              placeholder="Any special requests or information..."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-zinc-200"
          >
            {submitting ? "Submitting..." : "Submit Booking Request"}
          </Button>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`p-4 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-green-950 text-green-200 border border-green-800"
                  : "bg-red-950 text-red-200 border border-red-800"
              }`}
            >
              {message.text}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
