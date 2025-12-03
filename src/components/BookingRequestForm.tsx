import { useState, useMemo, useEffect } from "react";
import { collection, addDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { CountryCodeSelect } from "./CountryCodeSelect";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import type { Booking, Pilot, UserProfile } from "../types/index";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

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
  const [initialAvailability, setInitialAvailability] = useState<{ [key: string]: number }>({});
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submittedCustomerName, setSubmittedCustomerName] = useState("");

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

  // Check if date is 2+ months in the future
  const isFarFuture = useMemo(() => {
    const today = new Date();
    const twoMonthsFromNow = new Date(today);
    twoMonthsFromNow.setMonth(today.getMonth() + 2);
    return selectedDate >= twoMonthsFromNow;
  }, [selectedDate]);

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
  // Skip this for far-future bookings (2+ months in advance)
  useEffect(() => {
    if (isFarFuture) return; // No restrictions for far-future bookings

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
  }, [formData.timeIndex, formData.date, timeSlotAvailability, isFarFuture]);

  // Track initial availability when time slot is selected
  // Skip this for far-future bookings (2+ months in advance)
  useEffect(() => {
    if (isFarFuture) return; // No availability tracking for far-future bookings

    if (formData.timeIndex && formData.date) {
      const key = `${formData.date}-${formData.timeIndex}`;
      if (!initialAvailability[key]) {
        const selectedTimeSlot = timeSlotAvailability.find(
          slot => slot.timeIndex.toString() === formData.timeIndex
        );
        if (selectedTimeSlot) {
          setInitialAvailability(prev => ({
            ...prev,
            [key]: selectedTimeSlot.availableSpots
          }));
        }
      }
    }
  }, [formData.timeIndex, formData.date, timeSlotAvailability, initialAvailability, isFarFuture]);

  // Monitor availability changes while filling form
  // Skip this for far-future bookings (2+ months in advance)
  useEffect(() => {
    if (isFarFuture) return; // No restrictions for far-future bookings

    if (formData.timeIndex && formData.date && formData.numberOfPeople > 1) {
      const key = `${formData.date}-${formData.timeIndex}`;
      const initial = initialAvailability[key];

      if (initial !== undefined) {
        const selectedTimeSlot = timeSlotAvailability.find(
          slot => slot.timeIndex.toString() === formData.timeIndex
        );
        const currentAvailability = selectedTimeSlot?.availableSpots ?? 0;

        // Check if availability dropped below what user selected
        if (currentAvailability < formData.numberOfPeople) {
          setMessage({
            type: "error",
            text: "Oops! These spots are no longer available. Availability has changed while you were filling out the form. Please select a different time or number of people."
          });
          // Reset to allow re-selection
          setFormData(prev => ({ ...prev, numberOfPeople: 1 }));
          // Clear the initial availability to allow re-tracking
          setInitialAvailability(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
          });
        }
      }
    }
  }, [formData.timeIndex, formData.date, formData.numberOfPeople, timeSlotAvailability, initialAvailability, isFarFuture]);

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
        meetingPoint: formData.meetingPoint === "other" ? "" : formData.meetingPoint,
        flightType: formData.flightType,
        notes: formData.notes,
        status: "pending",
        createdAt: new Date(),
      });

      // Store customer name and show success screen
      setSubmittedCustomerName(formData.customerName);
      setSubmissionSuccess(true);
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

  // WhatsApp contact number with pre-filled message
  const whatsappNumber = "+41796225100";
  const whatsappMessage = `Hi! I just made a booking request under the name ${submittedCustomerName}`;
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\+/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(whatsappUrl)}`;

  // Success screen
  if (submissionSuccess) {
    return (
      <div className="min-h-screen bg-zinc-950 dark flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="max-w-2xl w-full text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-green-600 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Thank You Message */}
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Thank You for Your Booking Request!
          </h1>
          <p className="text-zinc-300 text-lg mb-8">
            We have received your request and will be in touch with you shortly.
          </p>

          {/* Last Minute Booking Notice */}
          <div className="bg-blue-950 border border-blue-800 rounded-lg p-4 mb-8">
            <p className="text-blue-200 text-sm">
              <strong>Last Minute Booking?</strong> To get your booking confirmed as fast as possible,
              contact us directly on WhatsApp.
            </p>
          </div>

          {/* QR Code */}
          <div className="mb-6">
            <p className="text-zinc-400 mb-4 text-sm">
              Scan to contact us on WhatsApp
            </p>
            <div className="inline-block bg-white p-4 rounded-lg">
              <img
                src={qrCodeUrl}
                alt="WhatsApp QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* WhatsApp Button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-8 py-4 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Contact us on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 dark flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Book a Flight</h1>
        <p className="text-zinc-400 mb-8 sm:mb-10">Fill out the form below to request a booking.</p>

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
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 hover:bg-zinc-800 transition-colors"
                >
                  <CalendarIcon className="h-5 w-5 text-zinc-400" />
                  <span>{format(selectedDate, "dd/MM/yyyy")}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-700" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setFormData((prev) => ({ ...prev, date: format(date, "yyyy-MM-dd") }));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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
                <SelectContent className="min-w-[280px] bg-zinc-900 border-zinc-700">
                  {timeSlotAvailability.map((slot) => {
                    const availableCount = slot.availableSpots;
                    const requiredPilots = formData.numberOfPeople;
                    // For far-future bookings, don't disable any slots
                    const isDisabled = !isFarFuture && availableCount < requiredPilots;

                    return (
                      <SelectItem
                        key={slot.timeIndex}
                        value={slot.timeIndex.toString()}
                        disabled={isDisabled}
                        className={`text-white focus:bg-zinc-800 focus:text-white ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="flex-shrink-0">{slot.timeSlot}</span>
                          {!isFarFuture && (
                            <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                              availableCount === 0
                                ? 'bg-red-900/50 text-red-400'
                                : 'bg-green-900/50 text-green-400'
                            }`}>
                              {availableCount} available
                            </span>
                          )}
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
            {showTimeWarning && !formData.timeIndex && (
              <div className="text-sm text-orange-400 bg-orange-950 border border-orange-800 rounded px-3 py-2">
                Please select a time slot first
              </div>
            )}
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                  // Disable all if no time selected
                  if (!formData.timeIndex) {
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setShowTimeWarning(true);
                          setTimeout(() => setShowTimeWarning(false), 3000);
                        }}
                        className="flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors bg-zinc-900 text-zinc-600 cursor-not-allowed"
                      >
                        {num}
                      </button>
                    );
                  }

                  // For far-future bookings, allow all numbers
                  if (isFarFuture) {
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, numberOfPeople: num }))}
                        className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                          formData.numberOfPeople === num
                            ? "bg-white text-black"
                            : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
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
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="HW" className="text-white focus:bg-zinc-800 focus:text-white">
                  Meet at our base near the landing field in the centre
                </SelectItem>
                <SelectItem value="OST" className="text-white focus:bg-zinc-800 focus:text-white">
                  Train Station Interlaken Ost (Outside BIG coop supermarket)
                </SelectItem>
                <SelectItem value="mhof" className="text-white focus:bg-zinc-800 focus:text-white">
                  Mattenhof Resort (Free Parking)
                </SelectItem>
                <SelectItem value="other" className="text-white focus:bg-zinc-800 focus:text-white">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
            className="w-full bg-white text-black hover:bg-zinc-200 mt-8"
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
