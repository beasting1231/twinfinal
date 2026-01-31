import { useState, useMemo, useEffect } from "react";
import { collection, addDoc, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
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
  const [hideAvailability, setHideAvailability] = useState(false);
  const [onlySensational, setOnlySensational] = useState(false);
  const [requireTermsAndConditions, setRequireTermsAndConditions] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [customFormData, setCustomFormData] = useState<{ name: string; commissionRate: number; onlySensational: boolean } | null>(null);

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

  // Skip availability restrictions if far future OR if admin has hidden availability
  const skipAvailabilityRestrictions = isFarFuture || hideAvailability;

  // Fetch form settings (hideAvailability) and custom form data
  // Also check URL param as fallback for cross-origin iframes
  useEffect(() => {
    const loadFormSettings = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlHideAvailability = urlParams.get('hideAvailability') === 'true';
      const formId = urlParams.get('formId');

      // If there's a custom formId, load that form's data
      if (formId) {
        try {
          const formDoc = await getDoc(doc(db, "bookingForms", formId));
          if (formDoc.exists()) {
            const data = formDoc.data();
            const formOnlySensational = data.onlySensational ?? false;
            const formHideAvailability = data.hideAvailability ?? false;
            const formRequireTerms = data.requireTermsAndConditions ?? false;
            setCustomFormData({
              name: data.name,
              commissionRate: data.commissionRate || 0,
              onlySensational: formOnlySensational,
            });
            // Use the custom form's settings - don't fall through to main form settings
            setOnlySensational(formOnlySensational);
            setHideAvailability(formHideAvailability);
            setRequireTermsAndConditions(formRequireTerms);
            setSettingsLoaded(true);
            return;
          }
        } catch (error) {
          console.error("Error loading custom form data:", error);
        }
      }

      // Check URL parameter for hideAvailability (for iframe cross-origin support)
      if (urlHideAvailability) {
        setHideAvailability(true);
        setSettingsLoaded(true);
        return;
      }

      // Otherwise try to fetch from Firestore settings (main form)
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "form"));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setHideAvailability(data.hideAvailability ?? false);
          setOnlySensational(data.onlySensational ?? false);
          setRequireTermsAndConditions(data.requireTermsAndConditions ?? false);
        }
      } catch (error) {
        console.error("Error loading form settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadFormSettings();
  }, []);

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
  // Skip this for far-future bookings (2+ months in advance) or when availability is hidden
  useEffect(() => {
    if (skipAvailabilityRestrictions) return; // No restrictions when skipping availability

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
  }, [formData.timeIndex, formData.date, timeSlotAvailability, skipAvailabilityRestrictions]);

  // Track initial availability when time slot is selected
  // Skip this for far-future bookings (2+ months in advance) or when availability is hidden
  useEffect(() => {
    if (skipAvailabilityRestrictions) return; // No availability tracking when skipping availability

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
  }, [formData.timeIndex, formData.date, timeSlotAvailability, initialAvailability, skipAvailabilityRestrictions]);

  // Monitor availability changes while filling form
  // Skip this for far-future bookings (2+ months in advance) or when availability is hidden
  useEffect(() => {
    if (skipAvailabilityRestrictions) return; // No restrictions when skipping availability

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
  }, [formData.timeIndex, formData.date, formData.numberOfPeople, timeSlotAvailability, initialAvailability, skipAvailabilityRestrictions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    // Check if terms are required and accepted
    if (requireTermsAndConditions && !termsAccepted) {
      setMessage({
        type: "error",
        text: "Please accept the terms and conditions to continue.",
      });
      setSubmitting(false);
      return;
    }

    try {
      // Convert timeIndex to time string
      const selectedTimeSlot = timeSlots[parseInt(formData.timeIndex)];

      // Combine country code and phone number
      const fullPhoneNumber = formData.phone
        ? `${formData.phoneCountryCode} ${formData.phone}`.trim()
        : "";

      // Determine booking source and commission based on form type
      const bookingSource = customFormData ? `${customFormData.name} form` : "Online";
      const numberOfPeople = Number(formData.numberOfPeople);

      const bookingRequestData: Record<string, unknown> = {
        customerName: formData.customerName,
        email: formData.email,
        phone: fullPhoneNumber,
        phoneCountryCode: formData.phoneCountryCode,
        date: formData.date,
        time: selectedTimeSlot,
        timeIndex: parseInt(formData.timeIndex),
        numberOfPeople,
        meetingPoint: formData.meetingPoint,
        flightType: formData.flightType,
        notes: formData.notes,
        bookingSource,
        status: "pending",
        createdAt: new Date(),
      };

      // Add commission data if this is a custom form with commission
      if (customFormData && customFormData.commissionRate > 0) {
        bookingRequestData.commission = customFormData.commissionRate * numberOfPeople;
        bookingRequestData.commissionStatus = "unpaid";
      }

      await addDoc(collection(db, "bookingRequests"), bookingRequestData);

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
      <div className="booking-request-form bg-gray-50 min-h-screen flex items-center justify-center px-4 py-6 sm:py-12">
        <div className="max-w-2xl w-full text-center">
          {/* Success Icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          {/* Thank You Message */}
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Thank You for Your Booking Request!
          </h1>
          <p className="text-gray-600 text-base sm:text-lg mb-6 sm:mb-8">
            We have received your request and will be in touch with you shortly.
          </p>

          {/* Last Minute Booking Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-6 sm:mb-8">
            <p className="text-blue-800 text-xs sm:text-sm">
              <strong>Last Minute Booking?</strong> To get your booking confirmed as fast as possible,
              contact us directly on WhatsApp.
            </p>
          </div>

          {/* QR Code */}
          <div className="mb-4 sm:mb-6">
            <p className="text-gray-500 mb-3 sm:mb-4 text-xs sm:text-sm">
              Scan to contact us on WhatsApp
            </p>
            <div className="inline-block bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200">
              <img
                src={qrCodeUrl}
                alt="WhatsApp QR Code"
                className="w-36 h-36 sm:w-48 sm:h-48"
              />
            </div>
          </div>

          {/* WhatsApp Button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-3 sm:px-8 sm:py-4 rounded-lg transition-colors text-sm sm:text-base"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Contact us on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-request-form bg-gray-50 flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="max-w-2xl w-full">
        <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-10">Book a Flight</h1>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Customer Name */}
          <div className="space-y-2">
            <label htmlFor="customerName" className="text-sm font-medium text-gray-700">
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
              className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
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
              className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <div className="flex gap-2">
              <CountryCodeSelect
                value={formData.phoneCountryCode}
                onChange={(code) => setFormData((prev) => ({ ...prev, phoneCountryCode: code }))}
                lightMode
              />
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="555 000 0000"
                className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400 flex-1"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <label htmlFor="date" className="text-sm font-medium text-gray-700">
              Date *
            </label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-3 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 hover:bg-gray-50 transition-colors"
                >
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                  <span>{format(selectedDate, "dd/MM/yyyy")}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 !bg-white !border-gray-200"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setFormData((prev) => ({ ...prev, date: format(date, "yyyy-MM-dd") }));
                      setDatePickerOpen(false);
                    }
                  }}
                  className="!bg-white"
                  classNames={{
                    caption_label: "text-sm font-medium text-gray-900",
                    nav_button: "h-7 w-7 bg-gray-100 p-0 text-gray-900 hover:bg-gray-200 border-gray-300 inline-flex items-center justify-center rounded-md border",
                    head_cell: "text-gray-500 rounded-md w-9 font-normal text-[0.8rem]",
                    cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-gray-100 [&:has([aria-selected])]:bg-gray-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-9 w-9 p-0 font-normal text-gray-900 aria-selected:opacity-100 hover:bg-gray-100 inline-flex items-center justify-center rounded-md",
                    day_selected: "bg-gray-900 text-white hover:bg-gray-900 hover:text-white focus:bg-gray-900 focus:text-white",
                    day_today: "bg-gray-100 text-gray-900",
                    day_outside: "day-outside text-gray-400 aria-selected:bg-gray-100 aria-selected:text-gray-500",
                    day_disabled: "text-gray-300 opacity-50",
                    day_range_middle: "aria-selected:bg-gray-100 aria-selected:text-gray-900",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Slot Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Time Slot *
            </label>
            {(loading || !settingsLoaded) ? (
              <div className="text-gray-500 text-sm">Loading availability...</div>
            ) : (
              <Select
                value={formData.timeIndex}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, timeIndex: value }))}
                required
              >
                <SelectTrigger className="!bg-white !border-gray-300 !text-gray-900">
                  <SelectValue placeholder="Select a time slot" />
                </SelectTrigger>
                <SelectContent className="min-w-[280px] !bg-white !border-gray-200 !text-gray-900">
                  {timeSlotAvailability.map((slot) => {
                    const availableCount = slot.availableSpots;
                    const requiredPilots = formData.numberOfPeople;
                    // Don't disable slots when skipping availability restrictions
                    const isDisabled = !skipAvailabilityRestrictions && availableCount < requiredPilots;

                    return (
                      <SelectItem
                        key={slot.timeIndex}
                        value={slot.timeIndex.toString()}
                        disabled={isDisabled}
                        className={`!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="flex-shrink-0">{slot.timeSlot}</span>
                          {!skipAvailabilityRestrictions && (
                            <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                              availableCount === 0
                                ? 'bg-red-100 text-red-600'
                                : 'bg-green-100 text-green-600'
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
            <label className="text-sm font-medium text-gray-700">
              Number of People *
            </label>
            {showTimeWarning && !formData.timeIndex && (
              <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-2">
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
                        className="flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors bg-gray-100 text-gray-400 cursor-not-allowed"
                      >
                        {num}
                      </button>
                    );
                  }

                  // When skipping availability restrictions, allow all numbers
                  if (skipAvailabilityRestrictions) {
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, numberOfPeople: num }))}
                        className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                          formData.numberOfPeople === num
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                          ? "bg-gray-900 text-white"
                          : isDisabled
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Meeting Point - hidden for custom forms, wait for settings to load */}
          {settingsLoaded && !customFormData && (
            <div className="space-y-2">
              <label htmlFor="meetingPoint" className="text-sm font-medium text-gray-700">
                Meeting Point *
              </label>
              <Select
                value={formData.meetingPoint}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, meetingPoint: value }))}
                required
              >
                <SelectTrigger className="!bg-white !border-gray-300 !text-gray-900">
                  <SelectValue placeholder="Select meeting point" />
                </SelectTrigger>
                <SelectContent className="!bg-white !border-gray-200 !text-gray-900">
                  <SelectItem value="HW" className="!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900">
                    Meet at our base near the landing field in the centre
                  </SelectItem>
                  <SelectItem value="OST" className="!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900">
                    Train Station Interlaken Ost (Outside BIG coop supermarket)
                  </SelectItem>
                  <SelectItem value="mhof" className="!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900">
                    Mattenhof Resort (Free Parking)
                  </SelectItem>
                  <SelectItem value="other" className="!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900">
                    Other meeting point in or near Interlaken
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Flight Type - hide completely when onlySensational is enabled, wait for settings to load */}
          {settingsLoaded && !onlySensational && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
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
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <div className="capitalize text-sm">{type}</div>
                    <div className="text-xs mt-1 opacity-80">{price}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium text-gray-700">
              Additional Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              placeholder="Any special requests or information..."
              className="w-full px-3 py-2 !bg-white !border !border-gray-300 rounded !text-gray-900 placeholder:!text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
            />
          </div>

          {/* Terms and Conditions - only show if required */}
          {settingsLoaded && requireTermsAndConditions && (
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="w-5 h-5 border-2 border-gray-300 rounded bg-white checked:bg-gray-900 checked:border-gray-900 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 cursor-pointer transition-colors"
                    required
                  />
                </div>
                <span className="text-sm text-gray-700 flex-1">
                  I accept the{" "}
                  <a
                    href="https://www.tandemparagliding.ch/gcc.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline font-medium"
                  >
                    terms and conditions
                  </a>
                  {" "}*
                </span>
              </label>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitting || (requireTermsAndConditions && !termsAccepted)}
            className="w-full !bg-gray-900 !text-white hover:!bg-gray-800 mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Booking Request"}
          </Button>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`p-4 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
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
