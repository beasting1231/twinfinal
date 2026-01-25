import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { Booking, Pilot, PilotPayment, ReceiptFile } from "../types/index";
import { useAuth } from "../contexts/AuthContext";
import { useEditing } from "../contexts/EditingContext";
import { useRole } from "../hooks/useRole";
import { Camera, Upload, Eye, Trash2, Calendar, Clock, MapPin, Users, Phone, Mail, FileText, User, PhoneCall, ChevronDown, ChevronUp, Loader2, History, Send, PenLine, Copy, Check } from "lucide-react";
import { toBlob } from "html-to-image";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, storage } from "../firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { BookingSourceAutocomplete } from "./BookingSourceAutocomplete";
import { MeetingPointAutocomplete, getMeetingPointAbbreviation } from "./MeetingPointAutocomplete";
import { EmailPreviewModal } from "./EmailPreviewModal";

interface BookingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  bookings: Booking[];
  pilots: Pilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  timeSlots: string[];
  timeOverrides?: Record<number, string>;
  onUpdate?: (id: string, booking: Partial<Booking>) => void;
  onDelete?: (id: string) => void;
  onNavigateToDate?: (date: Date) => void;
}

export function BookingDetailsModal({
  open,
  onOpenChange,
  booking,
  bookings,
  pilots,
  isPilotAvailableForTimeSlot,
  timeSlots,
  timeOverrides = {},
  onUpdate,
  onDelete,
  onNavigateToDate,
}: BookingDetailsModalProps) {
  const { currentUser } = useAuth();
  const { startEditing, stopEditing } = useEditing();
  const { canEditBooking, canDeleteBooking, role } = useRole();
  const [isEditing, setIsEditing] = useState(false);
  const [editedBooking, setEditedBooking] = useState<Booking | null>(null);

  // Pause real-time updates when modal is open
  useEffect(() => {
    if (open) {
      startEditing();
    } else {
      stopEditing();
    }
  }, [open, startEditing, stopEditing]);
  const [pilotPayments, setPilotPayments] = useState<PilotPayment[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editedDateAvailability, setEditedDateAvailability] = useState<Map<string, Set<string>>>(new Map());
  const [editedDatePilots, setEditedDatePilots] = useState<Pilot[]>([]);
  const [editedDateBookings, setEditedDateBookings] = useState<Booking[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isSavingPayments, setIsSavingPayments] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null);
  const [initialAvailableSlots, setInitialAvailableSlots] = useState<number | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [screenshotCopied, setScreenshotCopied] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);

  const captureBookingScreenshot = async () => {
    if (!booking?.id) return;

    setIsCapturingScreenshot(true);
    try {
      // Find the booking cell element by data-booking-id
      const bookingElement = document.querySelector(`[data-booking-id="${booking.id}"]`) as HTMLElement;

      // Find the time slot element by data-time-index
      const timeSlotElement = document.querySelector(`[data-time-index="${booking.timeIndex}"]`) as HTMLElement;

      // Find the date cell element
      const dateCellElement = document.querySelector(`[data-date-cell="true"]`) as HTMLElement;

      if (!bookingElement) {
        console.error('Booking element not found');
        alert('Could not find booking cell on the grid. Make sure the booking is visible.');
        return;
      }

      if (!timeSlotElement) {
        console.error('Time slot element not found');
        alert('Could not find time slot on the grid. Make sure the booking is visible.');
        return;
      }

      if (!dateCellElement) {
        console.error('Date cell element not found');
        alert('Could not find date cell on the grid. Make sure the booking is visible.');
        return;
      }

      // Capture all three elements separately as blobs
      const pixelRatio = 2;

      // Store original styles and apply light mode styles directly to DOM
      const originalStyles: Map<HTMLElement, { color: string; backgroundColor: string; display: string }> = new Map();

      const applyLightStyles = (element: HTMLElement) => {
        const elements = [element, ...Array.from(element.querySelectorAll('*'))];
        elements.forEach(el => {
          if (el instanceof HTMLElement) {
            // Store original inline styles
            originalStyles.set(el, {
              color: el.style.color,
              backgroundColor: el.style.backgroundColor,
              display: el.style.display
            });
            // Apply light mode styles
            el.style.setProperty('color', '#18181b', 'important'); // zinc-900
            // Check if element has dark background class
            const classes = el.className || '';
            if (classes.includes('bg-zinc') || classes.includes('bg-gray') || classes.includes('bg-slate')) {
              el.style.setProperty('background-color', '#d4d4d8', 'important'); // zinc-300
            }
          }
        });

        // Hide the pilot badges grid (last grid element in booking cell)
        const pilotGrid = element.querySelector('.grid');
        if (pilotGrid instanceof HTMLElement) {
          pilotGrid.style.setProperty('display', 'none', 'important');
        }
      };

      const restoreStyles = () => {
        originalStyles.forEach((styles, el) => {
          el.style.color = styles.color;
          el.style.backgroundColor = styles.backgroundColor;
          el.style.display = styles.display;
        });
        originalStyles.clear();
      };

      // Capture elements (time slot will be drawn manually on canvas)
      let dateCellBlob: Blob | null = null;
      let bookingBlob: Blob | null = null;

      try {
        // Apply light mode styles to booking element before capture
        applyLightStyles(bookingElement);

        const [dateResult, bookingResult] = await Promise.allSettled([
          toBlob(dateCellElement, { pixelRatio }),
          toBlob(bookingElement, { pixelRatio })
        ]);

        if (dateResult.status === 'fulfilled') dateCellBlob = dateResult.value;
        if (bookingResult.status === 'fulfilled') bookingBlob = bookingResult.value;
      } catch (e) {
        console.error('Failed to capture elements:', e);
      } finally {
        // Restore original styles immediately
        restoreStyles();
      }

      if (!dateCellBlob || !bookingBlob) {
        // If some captures failed, try again with lower quality
        try {
          applyLightStyles(bookingElement);
          if (!dateCellBlob) {
            dateCellBlob = await toBlob(dateCellElement, { pixelRatio: 1, skipFonts: true });
          }
          if (!bookingBlob) {
            bookingBlob = await toBlob(bookingElement, { pixelRatio: 1, skipFonts: true });
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        } finally {
          restoreStyles();
        }
      }

      if (!dateCellBlob || !bookingBlob) {
        throw new Error(`Failed to capture: date=${!!dateCellBlob}, booking=${!!bookingBlob}`);
      }

      // Convert blobs to images
      const loadImage = (blob: Blob): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
      };

      const [dateCellImg, bookingImg] = await Promise.all([
        loadImage(dateCellBlob),
        loadImage(bookingBlob)
      ]);

      // Create canvas to combine all images
      // Layout: [date cell] on top of [time slot] on the left
      //         [numbered headers 1,2,3...] on top of [booking] on the right
      const gap = 8 * pixelRatio;
      const padding = 8 * pixelRatio;
      const borderRadius = 8 * pixelRatio;
      const numberOfPeople = booking.numberOfPeople || booking.span || 1;

      // Time slot dimensions (drawn manually, height matches booking cell)
      const timeSlotWidth = dateCellImg.width;
      const timeSlotHeight = bookingImg.height;

      // Header dimensions (matching the date cell height)
      const headerHeight = dateCellImg.height;
      const headerCellWidth = bookingImg.width / numberOfPeople;

      const leftColumnWidth = Math.max(dateCellImg.width, timeSlotWidth);
      const leftColumnHeight = dateCellImg.height + gap + timeSlotHeight;
      const rightColumnHeight = headerHeight + gap + bookingImg.height;
      const canvasWidth = leftColumnWidth + gap + bookingImg.width + (padding * 2);
      const canvasHeight = Math.max(leftColumnHeight, rightColumnHeight) + (padding * 2);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Fill background (always light mode for screenshots)
      ctx.fillStyle = '#f4f4f5'; // zinc-100
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Calculate vertical positions
      const leftColumnStartY = padding + (canvasHeight - padding * 2 - leftColumnHeight) / 2;
      const rightColumnStartY = padding + (canvasHeight - padding * 2 - rightColumnHeight) / 2;

      // Draw date cell (centered horizontally in left column)
      const dateCellX = padding + (leftColumnWidth - dateCellImg.width) / 2;
      ctx.drawImage(dateCellImg, dateCellX, leftColumnStartY);

      // Draw time slot manually below date cell (dark grey background, white text)
      const timeSlotX = padding + (leftColumnWidth - timeSlotWidth) / 2;
      const timeSlotY = leftColumnStartY + dateCellImg.height + gap;

      // Get the time string from timeSlots array
      const timeString = timeSlots[booking.timeIndex] || '';

      // Draw rounded rectangle background
      ctx.fillStyle = '#52525b'; // zinc-600 (dark grey)
      ctx.beginPath();
      ctx.roundRect(timeSlotX, timeSlotY, timeSlotWidth, timeSlotHeight, borderRadius);
      ctx.fill();

      // Draw time text
      ctx.fillStyle = '#ffffff';
      ctx.font = `${14 * pixelRatio}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeString, timeSlotX + timeSlotWidth / 2, timeSlotY + timeSlotHeight / 2);

      // Draw numbered headers above booking cell
      const rightColumnX = padding + leftColumnWidth + gap;
      for (let i = 0; i < numberOfPeople; i++) {
        const headerX = rightColumnX + (i * headerCellWidth) + (i > 0 ? gap * i / numberOfPeople : 0);
        const actualHeaderWidth = headerCellWidth - (gap * (numberOfPeople - 1) / numberOfPeople);

        // Draw rounded rectangle background (always light mode for screenshots)
        ctx.fillStyle = '#e4e4e7'; // zinc-200
        ctx.beginPath();
        ctx.roundRect(headerX, rightColumnStartY, actualHeaderWidth, headerHeight, borderRadius);
        ctx.fill();

        // Draw number text
        ctx.fillStyle = '#18181b'; // zinc-900
        ctx.font = `bold ${14 * pixelRatio}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), headerX + actualHeaderWidth / 2, rightColumnStartY + headerHeight / 2);
      }

      // Draw booking image below headers
      const bookingY = rightColumnStartY + headerHeight + gap;
      ctx.drawImage(bookingImg, rightColumnX, bookingY);

      // Clean up object URLs
      URL.revokeObjectURL(dateCellImg.src);
      URL.revokeObjectURL(bookingImg.src);

      // Convert canvas to blob
      const finalBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob from canvas'));
        }, 'image/png');
      });

      // Try different methods to share/copy the image
      let success = false;

      // Method 1: Try clipboard API (works on desktop)
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': finalBlob
            })
          ]);
          success = true;
        } catch (clipboardError) {
          console.log('Clipboard API failed, trying alternatives...', clipboardError);
        }
      }

      // Method 2: Try Web Share API (works on mobile)
      if (!success && navigator.share && navigator.canShare) {
        try {
          const file = new File([finalBlob], `booking-${booking.id}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
            });
            success = true;
          }
        } catch (shareError) {
          // User cancelled or share failed
          if ((shareError as Error).name !== 'AbortError') {
            console.log('Web Share API failed, trying download...', shareError);
          } else {
            success = true; // User cancelled, but that's okay
          }
        }
      }

      // Method 3: Download the image as fallback
      if (!success) {
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `booking-${booking.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        success = true;
      }

      if (success) {
        setScreenshotCopied(true);
        setTimeout(() => setScreenshotCopied(false), 2000);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('Failed to capture screenshot. Please try again.');
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };


  // Create an availability check function that uses edited date data when in edit mode
  const checkPilotAvailability = (pilotUid: string, timeSlot: string): boolean => {
    if (isEditing) {
      // Always use fetched availability when in edit mode
      const slots = editedDateAvailability.get(pilotUid);
      return slots ? slots.has(timeSlot) : false;
    }
    // Use parent's availability check for view mode
    return isPilotAvailableForTimeSlot(pilotUid, timeSlot);
  };

  // Calculate available slots for ALL time slots (for dropdown display)
  const availableSlotsPerTime = useMemo(() => {
    if (!booking || !editedBooking) return {};

    const targetDate = editedBooking.date;
    const slotsMap: Record<number, number> = {};

    // Use editedDatePilots and editedDateBookings when in edit mode, otherwise use from props
    const pilotsToUse = isEditing ? editedDatePilots : pilots;
    const bookingsToUse = isEditing ? editedDateBookings : bookings;

    timeSlots.forEach((timeSlot, timeIndex) => {
      // Count total pilots available at this time slot
      const totalAvailablePilots = pilotsToUse.filter((pilot) =>
        checkPilotAvailability(pilot.uid, timeSlot)
      ).length;

      // Get bookings at this specific time (excluding current booking)
      const bookingsAtThisTime = bookingsToUse.filter(
        b => b.timeIndex === timeIndex && b.date === targetDate && b.id !== booking.id
      );

      // Count total passengers booked at this time (regardless of pilot assignment)
      const totalPassengersBooked = bookingsAtThisTime.reduce((sum, b) => {
        return sum + (b.numberOfPeople || 0);
      }, 0);

      // Available slots = total available pilots - total passengers already booked
      const availableSlots = totalAvailablePilots - totalPassengersBooked;

      slotsMap[timeIndex] = Math.max(0, availableSlots);
    });

    return slotsMap;
  }, [booking, editedBooking, pilots, editedDatePilots, bookings, editedDateBookings, timeSlots, isEditing, editedDateAvailability, isPilotAvailableForTimeSlot]);

  // Calculate available slots at this time based on actually available pilots (excluding the current booking)
  // Use editedBooking when in edit mode to recalculate for new time/date
  const availableSlots = useMemo(() => {
    if (!booking) return 0;

    const targetTimeIndex = editedBooking?.timeIndex ?? booking.timeIndex;
    return availableSlotsPerTime[targetTimeIndex] ?? 0;
  }, [booking, editedBooking, availableSlotsPerTime]);

  // Calculate available female pilots at this time
  const availableFemalePilots = useMemo(() => {
    if (!booking || !editedBooking) return 0;

    const targetDate = editedBooking.date;
    const targetTimeIndex = editedBooking.timeIndex;
    const targetTimeSlot = timeSlots[targetTimeIndex];

    // Use editedDatePilots and editedDateBookings when in edit mode, otherwise use from props
    const pilotsToUse = isEditing ? editedDatePilots : pilots;
    const bookingsToUse = isEditing ? editedDateBookings : bookings;

    // Get available female pilots at this time
    const availableFemalePilotsList = pilotsToUse.filter((pilot) =>
      pilot.femalePilot &&
      checkPilotAvailability(pilot.uid, targetTimeSlot)
    );

    // Get bookings at this specific time (excluding current booking)
    const bookingsAtThisTime = bookingsToUse.filter(
      b => b.timeIndex === targetTimeIndex && b.date === targetDate && b.id !== booking.id
    );

    // Count how many female pilots are already assigned
    const assignedFemalePilots = new Set<string>();
    bookingsAtThisTime.forEach(b => {
      b.assignedPilots.forEach(pilotName => {
        const pilot = pilotsToUse.find(p => p.displayName === pilotName);
        if (pilot?.femalePilot) {
          assignedFemalePilots.add(pilotName);
        }
      });
    });

    return availableFemalePilotsList.length - assignedFemalePilots.size;
  }, [booking, editedBooking, pilots, editedDatePilots, bookings, editedDateBookings, timeSlots, isEditing, editedDateAvailability]);

  useEffect(() => {
    if (booking) {
      setEditedBooking({ ...booking });
    }
  }, [booking]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  // Fetch pilot availability, pilot data, and bookings for the edited date
  useEffect(() => {
    if (!editedBooking || !isEditing) {
      // Clear data when not editing
      setEditedDateAvailability(new Map());
      setEditedDatePilots([]);
      setEditedDateBookings([]);
      return;
    }

    async function fetchDataForEditedDate() {
      if (!editedBooking) return; // Additional null check for TypeScript

      try {
        const dateStr = editedBooking.date;

        // Query availability collection for the edited date
        const availabilityQuery = query(
          collection(db, "availability"),
          where("date", "==", dateStr)
        );

        const availabilitySnapshot = await getDocs(availabilityQuery);

        // Get unique pilot IDs and build availability map
        const pilotIds = new Set<string>();
        const availabilityMap = new Map<string, Set<string>>();

        availabilitySnapshot.docs.forEach((doc) => {
          const data = doc.data();
          pilotIds.add(data.userId);

          if (!availabilityMap.has(data.userId)) {
            availabilityMap.set(data.userId, new Set());
          }
          availabilityMap.get(data.userId)!.add(data.timeSlot);
        });

        setEditedDateAvailability(availabilityMap);

        // Fetch pilot details for all pilots with availability on this date
        if (pilotIds.size > 0) {
          const pilotPromises = Array.from(pilotIds).map(async (uid) => {
            const profileQuery = query(
              collection(db, "userProfiles"),
              where("uid", "==", uid)
            );
            const profileSnapshot = await getDocs(profileQuery);

            if (profileSnapshot.empty) {
              return {
                uid,
                displayName: "Unknown Pilot",
                femalePilot: false,
              };
            }

            const profileData = profileSnapshot.docs[0].data();
            return {
              uid: profileData.uid,
              displayName: profileData.displayName || "Unknown Pilot",
              femalePilot: profileData.femalePilot || false,
            };
          });

          const pilotsData = await Promise.all(pilotPromises);
          setEditedDatePilots(pilotsData);
        } else {
          setEditedDatePilots([]);
        }

        // Fetch bookings for the edited date
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("date", "==", dateStr)
        );

        const bookingsSnapshot = await getDocs(bookingsQuery);
        const bookingsData = bookingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Booking));

        setEditedDateBookings(bookingsData);
      } catch (err) {
        console.error("Error fetching data for edited date:", err);
      }
    }

    fetchDataForEditedDate();
  }, [editedBooking?.date, isEditing]);

  // Initialize pilot payments when booking changes
  useEffect(() => {
    if (booking) {
      // If booking has existing payment data, use it
      if (booking.pilotPayments && booking.pilotPayments.length > 0) {
        setPilotPayments(booking.pilotPayments);
      } else {
        // Initialize empty payment data for each assigned pilot (excluding empty positions)
        const initialPayments: PilotPayment[] = booking.assignedPilots
          .filter(pilotName => pilotName && pilotName !== "")
          .map(pilotName => ({
            pilotName,
            amount: "",
            paymentMethod: "direkt" as const,
            receiptFiles: []
          }));
        setPilotPayments(initialPayments);
      }
    }
  }, [booking]);

  // Update pilot payments when edited booking's assigned pilots change
  useEffect(() => {
    if (editedBooking && editedBooking.assignedPilots) {
      const currentPilotNames = editedBooking.assignedPilots.filter(p => p && p !== "");
      const existingPilotNames = pilotPayments.map(p => p.pilotName);

      // Check if pilot list has changed
      const pilotsChanged =
        currentPilotNames.length !== existingPilotNames.length ||
        currentPilotNames.some(name => !existingPilotNames.includes(name));

      if (pilotsChanged) {
        // Keep existing payment data for pilots that are still assigned
        const updatedPayments = currentPilotNames.map(pilotName => {
          const existingPayment = pilotPayments.find(p => p.pilotName === pilotName);
          return existingPayment || {
            pilotName,
            amount: "",
            paymentMethod: "direkt" as const,
            receiptFiles: []
          };
        });
        setPilotPayments(updatedPayments);
      }
    }
  }, [editedBooking?.assignedPilots]);

  // Track initial available slots when starting to edit
  useEffect(() => {
    if (isEditing && editedBooking && initialAvailableSlots === null) {
      setInitialAvailableSlots(availableSlots);
      setAvailabilityError(false);
    }
    if (!isEditing) {
      setInitialAvailableSlots(null);
      setAvailabilityError(false);
    }
  }, [isEditing, editedBooking, availableSlots, initialAvailableSlots]);

  // Monitor availability changes during editing
  useEffect(() => {
    if (!isEditing || !editedBooking || initialAvailableSlots === null) return;

    const requestedSpots = editedBooking.numberOfPeople;

    // Check if spots are no longer available
    if (availableSlots < requestedSpots) {
      setAvailabilityError(true);
    } else {
      setAvailabilityError(false);
    }
  }, [isEditing, editedBooking?.timeIndex, editedBooking?.date, editedBooking?.numberOfPeople, availableSlots, initialAvailableSlots, role]);

  // Check if booking is more than 24 hours in the past
  const isBookingOlderThan24Hours = useMemo(() => {
    if (!booking?.date) return false;

    // Parse the booking date and set to end of day to be generous
    const bookingDate = new Date(booking.date + 'T23:59:59');
    const now = new Date();
    const hoursDifference = (now.getTime() - bookingDate.getTime()) / (1000 * 60 * 60);

    return hoursDifference > 24;
  }, [booking?.date]);

  // Check if current user can edit booking details (main edit mode)
  // Non-admins cannot edit bookings older than 24 hours
  const canEditBookingDetails = useMemo(() => {
    if (role === 'admin') return true; // Admins can always edit
    if (isBookingOlderThan24Hours) return false; // Non-admins cannot edit old bookings
    return true;
  }, [role, isBookingOlderThan24Hours]);

  // Check if current user can edit payment details
  // Non-admins cannot edit payments for bookings older than 24 hours
  const canEditPaymentDetails = useMemo(() => {
    if (role === 'admin') return true; // Admins can always edit
    if (isBookingOlderThan24Hours) return false; // Non-admins cannot edit old bookings
    return true;
  }, [role, isBookingOlderThan24Hours]);

  // Sort pilot payments to show current user's section first
  const sortedPilotPayments = useMemo(() => {
    if (!currentUser?.displayName) return pilotPayments;

    const currentUserPayment = pilotPayments.find(p => p.pilotName === currentUser.displayName);
    const otherPayments = pilotPayments.filter(p => p.pilotName !== currentUser.displayName);

    return currentUserPayment ? [currentUserPayment, ...otherPayments] : pilotPayments;
  }, [pilotPayments, currentUser?.displayName]);

  if (!booking || !editedBooking) return null;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (booking.id && onUpdate) {

      // Build update object with only changed fields
      const updates: any = {};

      // Check if date or time has changed
      const dateOrTimeChanged =
        editedBooking.date !== booking.date ||
        editedBooking.timeIndex !== booking.timeIndex;

      if (editedBooking.date !== booking.date) {
        updates.date = editedBooking.date;
      }
      if (editedBooking.timeIndex !== booking.timeIndex) {
        updates.timeIndex = editedBooking.timeIndex;
      }
      if (editedBooking.pilotIndex !== booking.pilotIndex) {
        updates.pilotIndex = editedBooking.pilotIndex;
      }
      if (editedBooking.customerName !== booking.customerName) {
        updates.customerName = editedBooking.customerName;
      }
      if (editedBooking.numberOfPeople !== booking.numberOfPeople) {
        updates.numberOfPeople = editedBooking.numberOfPeople;
      }
      if (editedBooking.pickupLocation !== booking.pickupLocation) {
        updates.pickupLocation = editedBooking.pickupLocation || "";
      }
      if (editedBooking.bookingSource !== booking.bookingSource) {
        updates.bookingSource = editedBooking.bookingSource;
      }
      if (editedBooking.phoneNumber !== booking.phoneNumber) {
        // Include even if empty (to allow deletion)
        updates.phoneNumber = editedBooking.phoneNumber?.trim() || "";
      }
      if (editedBooking.email !== booking.email) {
        // Include even if empty (to allow deletion)
        updates.email = editedBooking.email?.trim() || "";
      }
      if (editedBooking.notes !== booking.notes) {
        // Include even if empty (to allow deletion)
        updates.notes = editedBooking.notes?.trim() || "";
      }
      if (editedBooking.bookingStatus !== booking.bookingStatus) {
        updates.bookingStatus = editedBooking.bookingStatus;
      }
      if (editedBooking.span !== booking.span) {
        updates.span = editedBooking.span;
      }
      if (editedBooking.commission !== booking.commission) {
        updates.commission = editedBooking.commission;
      }
      if (editedBooking.commissionStatus !== booking.commissionStatus) {
        updates.commissionStatus = editedBooking.commissionStatus;
      }
      if (editedBooking.femalePilotsRequired !== booking.femalePilotsRequired) {
        updates.femalePilotsRequired = editedBooking.femalePilotsRequired;
      }
      if (editedBooking.flightType !== booking.flightType) {
        updates.flightType = editedBooking.flightType;
      }

      // If date or time changed, clear assigned pilots and payment info
      if (dateOrTimeChanged) {
        updates.assignedPilots = [];
        updates.pilotPayments = [];
      }

      // Update the booking in the database
      onUpdate(booking.id, updates);

      // Close edit mode
      setIsEditing(false);

      // Close the modal
      onOpenChange(false);

      // Navigate to the booking's date (use the edited date)
      if (onNavigateToDate) {
        const bookingDate = new Date(editedBooking.date + 'T00:00:00');
        onNavigateToDate(bookingDate);
      }
    }
  };

  const handleCancel = () => {
    setEditedBooking({ ...booking });
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (booking.id && onDelete) {
      if (confirm("Are you sure you want to delete this booking?")) {
        onDelete(booking.id);
        onOpenChange(false);
      }
    }
  };

  const handleNoShow = () => {
    // Show the custom dialog to ask about pilot payment
    setShowNoShowDialog(true);
    setShowStatusDropdown(false);
  };

  const handleNoShowPilotPayment = (willPay: boolean) => {
    if (!booking.id || !onUpdate) return;

    if (willPay) {
      // Set payment to -103 with method "ticket" for all assigned pilots
      const updatedPayments: PilotPayment[] = editedBooking.assignedPilots.map(pilotUid => {
        const pilot = pilots.find(p => p.uid === pilotUid);
        const pilotName = pilot?.displayName || "Unknown";

        // Check if payment already exists
        const existingPayment = pilotPayments.find(p => p.pilotName === pilotName);

        return {
          pilotName,
          amount: -103,
          paymentMethod: "ticket" as const,
          receiptFiles: existingPayment?.receiptFiles || [],
        };
      });

      // Update the booking with no show status and payments
      onUpdate(booking.id, {
        bookingStatus: 'no show',
        pilotPayments: updatedPayments
      });
      setEditedBooking({ ...editedBooking, bookingStatus: 'no show', pilotPayments: updatedPayments });
      setPilotPayments(updatedPayments);
    } else {
      // Unassign all pilots
      onUpdate(booking.id, {
        bookingStatus: 'no show',
        assignedPilots: [],
        pilotPayments: []
      });
      setEditedBooking({ ...editedBooking, bookingStatus: 'no show', assignedPilots: [], pilotPayments: [] });
      setPilotPayments([]);
    }

    setShowNoShowDialog(false);
  };

  const handlePaymentUpdate = (pilotName: string, field: keyof PilotPayment, value: any) => {
    setPilotPayments(prev =>
      prev.map(payment => {
        if (payment.pilotName === pilotName) {
          // If changing payment method, default amount based on method
          if (field === 'paymentMethod') {
            if (value === 'ticket' || value === 'ccp') {
              return { ...payment, [field]: value, amount: -103 };
            } else if (value === 'direkt') {
              return { ...payment, [field]: value, amount: 180 };
            }
          }
          return { ...payment, [field]: value };
        }
        return payment;
      })
    );
  };

  const handleImageUpload = async (pilotName: string, file: File) => {
    if (!booking?.id || !onUpdate) {
      alert("Cannot upload receipt: Booking ID not found");
      return;
    }

    setUploadingReceipt(pilotName);

    try {
      // Create a unique filename with timestamp
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `receipts/${booking.id}/${pilotName}/${timestamp}_${sanitizedFilename}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);

      // Create receipt file object with URL
      const receiptFile: ReceiptFile = {
        url: downloadURL,
        filename: file.name
      };

      // Update pilot payments with new receipt
      const updatedPayments = pilotPayments.map(payment =>
        payment.pilotName === pilotName
          ? { ...payment, receiptFiles: [...(payment.receiptFiles || []), receiptFile] }
          : payment
      );

      // Convert to Firestore-compatible format
      const firestoreCompatiblePayments = JSON.parse(JSON.stringify(updatedPayments.map(payment => ({
        pilotName: payment.pilotName,
        amount: typeof payment.amount === 'string'
          ? (payment.amount === '' || payment.amount === '-' ? 0 : parseFloat(payment.amount))
          : payment.amount,
        paymentMethod: payment.paymentMethod,
        receiptFiles: payment.receiptFiles || []
      }))));

      // Save to database immediately
      await onUpdate(booking.id, { pilotPayments: firestoreCompatiblePayments });

      // Update local state
      setPilotPayments(updatedPayments);
    } catch (error) {
      console.error("Error uploading receipt:", error);
      alert("Failed to upload receipt. Please try again.");
    } finally {
      setUploadingReceipt(null);
    }
  };

  const handleRemoveReceipt = async (pilotName: string, index: number) => {
    if (!booking?.id || !onUpdate) {
      alert("Cannot remove receipt: Booking ID not found");
      return;
    }

    // Check if user is authorized to delete this receipt
    if (role !== 'admin' && currentUser?.displayName !== pilotName) {
      alert("You can only delete receipts that you have uploaded.");
      return;
    }

    // Confirm before deleting
    if (!confirm("Are you sure you want to delete this receipt? This action cannot be undone.")) {
      return;
    }

    try {
      // Update pilot payments with receipt removed
      const updatedPayments = pilotPayments.map(payment =>
        payment.pilotName === pilotName
          ? { ...payment, receiptFiles: payment.receiptFiles?.filter((_, i) => i !== index) }
          : payment
      );

      // Convert to Firestore-compatible format
      const firestoreCompatiblePayments = JSON.parse(JSON.stringify(updatedPayments.map(payment => ({
        pilotName: payment.pilotName,
        amount: typeof payment.amount === 'string'
          ? (payment.amount === '' || payment.amount === '-' ? 0 : parseFloat(payment.amount))
          : payment.amount,
        paymentMethod: payment.paymentMethod,
        receiptFiles: payment.receiptFiles || []
      }))));

      // Save to database immediately
      await onUpdate(booking.id, { pilotPayments: firestoreCompatiblePayments });

      // Update local state
      setPilotPayments(updatedPayments);
    } catch (error) {
      console.error("Error removing receipt:", error);
      alert("Failed to remove receipt. Please try again.");
    }
  };

  const handleSavePayments = async () => {
    if (booking.id && onUpdate) {
      setIsSavingPayments(true);
      try {
        console.log("Saving payment details:", pilotPayments);

        // Convert to Firestore-compatible format using deep clone
        // This ensures all nested objects are plain JavaScript objects
        const firestoreCompatiblePayments = JSON.parse(JSON.stringify(pilotPayments.map(payment => ({
          pilotName: payment.pilotName,
          amount: typeof payment.amount === 'string'
            ? (payment.amount === '' || payment.amount === '-' ? 0 : parseFloat(payment.amount))
            : payment.amount,
          paymentMethod: payment.paymentMethod,
          receiptFiles: payment.receiptFiles || []
        }))));

        await onUpdate(booking.id, { pilotPayments: firestoreCompatiblePayments });
        onOpenChange(false);
      } catch (error) {
        console.error("Error saving payment details:", error);
        alert("Failed to save payment details. Please try again.");
      } finally {
        setIsSavingPayments(false);
      }
    } else {
      console.error("Cannot save: booking.id or onUpdate is missing", { bookingId: booking?.id, hasOnUpdate: !!onUpdate });
    }
  };

  // Handle modal close - clear pilots and payments if status is cancelled
  const handleOpenChange = (newOpen: boolean) => {
    console.log("Modal closing:", {
      newOpen,
      bookingStatus: editedBooking?.bookingStatus,
      bookingId: booking?.id,
      hasOnUpdate: !!onUpdate
    });

    // If modal is closing and booking status is cancelled, clear pilots and payments
    if (!newOpen && editedBooking?.bookingStatus === 'cancelled' && booking?.id && onUpdate) {
      console.log("Clearing pilots and payments for cancelled booking");
      const emptyPilots = Array(editedBooking.numberOfPeople).fill("");
      onUpdate(booking.id, {
        assignedPilots: emptyPilots,
        pilotPayments: []
      });
    }

    // Call original onOpenChange
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[90vw] max-w-[600px] overflow-x-hidden allow-select rounded-2xl bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white" hideCloseButton aria-describedby={undefined}>
        <div className="sr-only">
          <DialogTitle className="text-gray-900 dark:text-white">Booking Details</DialogTitle>
        </div>
        <Tabs defaultValue="details" className="w-full overflow-x-hidden">
          <TabsList className={`grid w-full ${role !== 'agency' && role !== 'driver' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="details">Booking Details</TabsTrigger>
            {role !== 'agency' && role !== 'driver' && (
              <TabsTrigger value="payment">Payment</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="details" className="space-y-4 overflow-x-hidden px-1">
            {!isEditing ? (
              // DISPLAY MODE - Beautiful card layout
              <div className="space-y-3">
                {/* Status Badge and Screenshot Button */}
                <div className="flex items-center justify-between mb-4 relative">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => canEditBookingDetails && setShowStatusDropdown(!showStatusDropdown)}
                    disabled={!canEditBookingDetails}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      !canEditBookingDetails
                        ? 'cursor-default'
                        : 'cursor-pointer hover:scale-105'
                    } ${
                      editedBooking.bookingStatus === 'unconfirmed'
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/30 hover:bg-blue-200 dark:hover:bg-blue-500/30'
                        : editedBooking.bookingStatus === 'confirmed'
                        ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30 hover:bg-green-200 dark:hover:bg-green-500/30'
                        : editedBooking.bookingStatus === 'pending'
                        ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/30 hover:bg-yellow-200 dark:hover:bg-yellow-500/30'
                        : editedBooking.bookingStatus === 'no show'
                        ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-500/30 hover:bg-orange-200 dark:hover:bg-orange-500/30'
                        : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-200 dark:hover:bg-red-500/30'
                    }`}
                  >
                    {editedBooking.bookingStatus.charAt(0).toUpperCase() + editedBooking.bookingStatus.slice(1)}
                  </button>
                  </div>

                  {/* Screenshot Button */}
                  <button
                    onClick={captureBookingScreenshot}
                    disabled={isCapturingScreenshot}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
                    title="Copy booking cell screenshot"
                  >
                    {isCapturingScreenshot ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : screenshotCopied ? (
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  {showStatusDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowStatusDropdown(false)}
                      />
                      <div className="absolute top-full left-0 mt-2 flex flex-col gap-2 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg p-2 shadow-xl z-20">
                        <button
                          onClick={() => {
                            setEditedBooking({ ...editedBooking, bookingStatus: 'unconfirmed' });
                            if (booking.id && onUpdate) {
                              onUpdate(booking.id, { bookingStatus: 'unconfirmed' });
                            }
                            setShowStatusDropdown(false);
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/30 hover:bg-blue-200 dark:hover:bg-blue-500/30"
                        >
                          Unconfirmed
                        </button>
                        <button
                          onClick={() => {
                            setEditedBooking({ ...editedBooking, bookingStatus: 'confirmed' });
                            if (booking.id && onUpdate) {
                              onUpdate(booking.id, { bookingStatus: 'confirmed' });
                            }
                            setShowStatusDropdown(false);
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30 hover:bg-green-200 dark:hover:bg-green-500/30"
                        >
                          Confirmed
                        </button>
                        <button
                          onClick={() => {
                            setEditedBooking({ ...editedBooking, bookingStatus: 'pending' });
                            if (booking.id && onUpdate) {
                              onUpdate(booking.id, { bookingStatus: 'pending' });
                            }
                            setShowStatusDropdown(false);
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/30 hover:bg-yellow-200 dark:hover:bg-yellow-500/30"
                        >
                          Pending
                        </button>
                        <button
                          onClick={() => {
                            setEditedBooking({ ...editedBooking, bookingStatus: 'cancelled' });
                            if (booking.id && onUpdate) {
                              onUpdate(booking.id, { bookingStatus: 'cancelled' });
                            }
                            setShowStatusDropdown(false);
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-200 dark:hover:bg-red-500/30"
                        >
                          Cancelled
                        </button>
                        <button
                          onClick={handleNoShow}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105 bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-500/30 hover:bg-orange-200 dark:hover:bg-orange-500/30"
                        >
                          No Show
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Customer Info Card */}
                <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 dark:text-zinc-500 mb-1">Customer</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white break-words">{editedBooking.customerName || <span className="text-gray-500 dark:text-zinc-500">Not provided</span>}</div>
                    </div>
                  </div>
                </div>

                {/* Date & Time Card */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Date</span>
                    </div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {new Date(editedBooking.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                  <div className={`border rounded-xl p-4 ${timeOverrides[editedBooking.timeIndex] ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700' : 'bg-gray-50 dark:bg-zinc-900/50 border-gray-300 dark:border-zinc-800'}`}>
                    <div className={`flex items-center gap-2 mb-2 ${timeOverrides[editedBooking.timeIndex] ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-zinc-500'}`}>
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Time</span>
                    </div>
                    <div className={`font-medium ${timeOverrides[editedBooking.timeIndex] ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                      {timeOverrides[editedBooking.timeIndex] || timeSlots[editedBooking.timeIndex]}
                    </div>
                  </div>
                </div>

                {/* Location & People */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 mb-2">
                      <MapPin className="w-4 h-4" />
                      <span className="text-xs">Meeting Point</span>
                    </div>
                    <div className="text-gray-900 dark:text-white font-medium break-words">{getMeetingPointAbbreviation(editedBooking.pickupLocation) || <span className="text-gray-500 dark:text-zinc-500">Not provided</span>}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 mb-2">
                      <Users className="w-4 h-4" />
                      <span className="text-xs">Passengers</span>
                    </div>
                    <div className="text-gray-900 dark:text-white font-medium">{editedBooking.numberOfPeople}</div>
                  </div>
                </div>

                {/* Source */}
                <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs">Booking Source</span>
                  </div>
                  <div className="text-gray-900 dark:text-white font-medium">{editedBooking.bookingSource}</div>
                </div>

                {/* Contact Info */}
                {(editedBooking.phoneNumber || editedBooking.email) && (
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                    {editedBooking.phoneNumber && (
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-gray-500 dark:text-zinc-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 dark:text-zinc-500 mb-0.5">Phone</div>
                          <button
                            onClick={() => copyToClipboard(editedBooking.phoneNumber!, 'phone')}
                            className="text-gray-900 dark:text-white break-words text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            {copiedField === 'phone' ? (
                              <span className="text-green-600 dark:text-green-400">Copied to clipboard!</span>
                            ) : (
                              editedBooking.phoneNumber
                            )}
                          </button>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <a
                            href={`https://wa.me/${editedBooking.phoneNumber.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-green-100 dark:bg-[#25D366] hover:bg-green-200 dark:hover:bg-[#20BA5A] text-green-700 dark:text-white transition-colors"
                            title="WhatsApp"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </a>
                          <a
                            href={`tel:${editedBooking.phoneNumber}`}
                            className="p-2 rounded-lg bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-white transition-colors"
                            title="Call"
                          >
                            <PhoneCall className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )}
                    {editedBooking.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-gray-500 dark:text-zinc-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 dark:text-zinc-500 mb-0.5">Email</div>
                          <button
                            onClick={() => copyToClipboard(editedBooking.email!, 'email')}
                            className="text-gray-900 dark:text-white break-words text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            {copiedField === 'email' ? (
                              <span className="text-green-600 dark:text-green-400">Copied to clipboard!</span>
                            ) : (
                              editedBooking.email
                            )}
                          </button>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="p-2 rounded-lg bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-white transition-colors"
                                title="Send Email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700" align="end">
                              <div className="flex flex-col gap-1">
                                <a
                                  href={`mailto:${editedBooking.email}`}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white transition-colors text-sm"
                                >
                                  <PenLine className="w-4 h-4" />
                                  Compose
                                </a>
                                <button
                                  onClick={() => setShowEmailPreview(true)}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white transition-colors text-sm w-full text-left"
                                >
                                  <Send className="w-4 h-4" />
                                  Booking Confirmation
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Assigned Pilots */}
                <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-gray-500 dark:text-zinc-500 mb-3">Assigned Pilots</div>
                  <div className="flex gap-2 flex-wrap">
                    {booking.assignedPilots.filter(pilot => pilot && pilot !== "").map((pilot, index) => (
                      <div key={index} className="bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-zinc-700">
                        {pilot}
                      </div>
                    ))}
                    {booking.assignedPilots.filter(pilot => pilot && pilot !== "").length === 0 && (
                      <div className="text-gray-500 dark:text-zinc-500 text-sm">No pilots assigned</div>
                    )}
                  </div>
                </div>

                {/* Additional Notes */}
                {editedBooking.notes && (
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl p-4">
                    <div className="text-xs text-gray-500 dark:text-zinc-500 mb-2">Notes</div>
                    <div className="text-gray-900 dark:text-white text-sm leading-relaxed whitespace-pre-wrap break-words">{editedBooking.notes}</div>
                  </div>
                )}

                {/* Booking History - Collapsible */}
                <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-gray-500 dark:text-zinc-500" />
                      <span className="text-xs text-gray-500 dark:text-zinc-500">Booking History</span>
                    </div>
                    {showHistory ? (
                      <ChevronUp className="w-4 h-4 text-gray-500 dark:text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500 dark:text-zinc-500" />
                    )}
                  </button>

                  {showHistory && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-zinc-800">
                      {/* Show history entries if they exist */}
                      {booking.history && booking.history.length > 0 ? (
                        <div className="pt-3 space-y-2">
                          {[...booking.history].reverse().map((entry, index) => {
                            const formatDate = (timestamp: any) => {
                              try {
                                const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
                                return date.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                });
                              } catch {
                                return 'Unknown date';
                              }
                            };

                            const getActionLabel = (action: string) => {
                              switch (action) {
                                case 'created': return 'Created';
                                case 'edited': return 'Edited';
                                case 'moved': return 'Moved';
                                case 'deleted': return 'Deleted';
                                case 'restored': return 'Restored';
                                case 'status_changed': return 'Status changed';
                                case 'pilot_assigned': return 'Pilot assigned';
                                case 'pilot_unassigned': return 'Pilot unassigned';
                                default: return action;
                              }
                            };

                            const getActionColor = (action: string) => {
                              switch (action) {
                                case 'created': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
                                case 'deleted': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
                                case 'restored': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
                                case 'moved': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
                                default: return 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300';
                              }
                            };

                            return (
                              <div key={index} className="flex items-start gap-3 text-sm">
                                <div className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.action)}`}>
                                  {getActionLabel(entry.action)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-gray-900 dark:text-white">
                                    <span className="font-medium">{entry.userName}</span>
                                    {entry.details && (
                                      <span className="text-gray-600 dark:text-zinc-400 ml-1">
                                        {entry.details}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    {formatDate(entry.timestamp)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Fallback to legacy created/deleted info */
                        <div className="pt-3 space-y-2">
                          {(booking.createdByName || booking.createdBy || booking.createdAt) && (
                            <div className="flex items-start gap-3 text-sm">
                              <div className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                Created
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-900 dark:text-white">
                                  <span className="font-medium">{booking.createdByName || booking.createdBy || 'Unknown'}</span>
                                </div>
                                {booking.createdAt && (
                                  <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    {(() => {
                                      try {
                                        const date = booking.createdAt.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
                                        return date.toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        });
                                      } catch {
                                        return 'Unknown date';
                                      }
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {(booking.deletedByName || booking.deletedBy || booking.deletedAt) && (
                            <div className="flex items-start gap-3 text-sm">
                              <div className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                Deleted
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-900 dark:text-white">
                                  <span className="font-medium">{booking.deletedByName || booking.deletedBy || 'Unknown'}</span>
                                </div>
                                {booking.deletedAt && (
                                  <div className="text-xs text-gray-500 dark:text-zinc-500">
                                    {(() => {
                                      try {
                                        const date = booking.deletedAt.toDate ? booking.deletedAt.toDate() : new Date(booking.deletedAt);
                                        return date.toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        });
                                      } catch {
                                        return 'Unknown date';
                                      }
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {!booking.createdByName && !booking.createdBy && !booking.createdAt && !booking.deletedByName && !booking.deletedBy && !booking.deletedAt && (
                            <div className="pt-1 text-sm text-gray-500 dark:text-zinc-500">
                              No history available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // EDIT MODE - Form layout
              <div className="space-y-4">
                {/* Availability Error Banner */}
                {availabilityError && role !== 'admin' && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200">
                    <p className="text-sm font-semibold mb-1">
                      ⚠️ Insufficient Availability
                    </p>
                    <p className="text-xs">
                      The selected time slot does not have enough available pilots for this booking ({editedBooking.numberOfPeople} requested, only {availableSlots} available). Please select a different time slot or reduce the number of people.
                    </p>
                  </div>
                )}

                {availabilityError && role === 'admin' && (
                  <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-200">
                    <p className="text-sm font-semibold mb-1">
                      ⚠️ Overbooking Warning
                    </p>
                    <p className="text-xs">
                      The selected time slot does not have enough available pilots ({editedBooking.numberOfPeople} requested, only {availableSlots} available). You can proceed as admin, but the grid will expand to accommodate this overbooking.
                    </p>
                  </div>
                )}

                {/* Customer Name */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Customer Name</Label>
                  <Input
                    value={editedBooking.customerName}
                    onChange={(e) => setEditedBooking({ ...editedBooking, customerName: e.target.value })}
                    autoComplete="off"
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Date</Label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={editedBooking.date}
                      onChange={(e) => {
                        setEditedBooking({
                          ...editedBooking,
                          date: e.target.value
                        });
                      }}
                      className="pr-10 !h-10 !py-0 !text-sm flex items-center max-h-10 [&::-webkit-date-and-time-value]:!text-sm [&::-webkit-date-and-time-value]:leading-10 dark:[color-scheme:dark] [color-scheme:light]"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        appearance: 'none',
                        fontSize: '14px',
                        lineHeight: '2.5rem'
                      } as React.CSSProperties}
                      autoComplete="off"
                      id="booking-date-input"
                    />
                    <Calendar
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900 dark:text-white cursor-pointer"
                      onClick={() => {
                        const dateInput = document.getElementById('booking-date-input') as HTMLInputElement;
                        if (dateInput) {
                          dateInput.showPicker?.();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Time Slot */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Time Slot</Label>
                  <Select
                    value={editedBooking.timeIndex.toString()}
                    onValueChange={(value) => {
                      setEditedBooking({
                        ...editedBooking,
                        timeIndex: parseInt(value),
                        pilotIndex: 0
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px]">
                      {timeSlots.map((slot, index) => {
                        const availableCount = availableSlotsPerTime[index] ?? 0;
                        const requiredPilots = editedBooking.numberOfPeople;
                        // Admins can overbook, regular users cannot
                        const isDisabled = role !== 'admin' && availableCount < requiredPilots;
                        return (
                          <SelectItem
                            key={index}
                            value={index.toString()}
                            disabled={isDisabled}
                            className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            <div className="flex items-center justify-between gap-4 w-full">
                              <span className="flex-shrink-0">{slot}</span>
                              <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                                availableCount < requiredPilots
                                  ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                                  : availableCount <= requiredPilots + 1
                                  ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
                                  : 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                              }`}>
                                {availableCount} available
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Available Slots Warning */}
                {availableSlots < editedBooking.numberOfPeople && (
                  <div className={`px-4 py-3 rounded-lg ${
                    role === 'admin'
                      ? 'bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200'
                      : 'bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
                  }`}>
                    {role === 'admin' ? (
                      <>
                        <p className="text-sm font-medium">
                          Overbooking Warning
                        </p>
                        <p className="text-xs mt-1">
                          This booking requires {editedBooking.numberOfPeople} {editedBooking.numberOfPeople === 1 ? 'pilot' : 'pilots'}, but only {availableSlots} {availableSlots === 1 ? 'is' : 'are'} available. The grid will expand to accommodate this booking.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          Insufficient pilots available at this time
                        </p>
                        <p className="text-xs mt-1">
                          This booking requires {editedBooking.numberOfPeople} {editedBooking.numberOfPeople === 1 ? 'pilot' : 'pilots'}, but only {availableSlots} {availableSlots === 1 ? 'is' : 'are'} available. Please select a different date or time slot.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Number of People */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Number of People</Label>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 pb-2">
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                        // Admins can overbook, regular users cannot
                        const isDisabled = role !== 'admin' && num > availableSlots;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              if (!isDisabled) {
                                setEditedBooking({
                                  ...editedBooking,
                                  numberOfPeople: num,
                                  span: num
                                });
                              }
                            }}
                            disabled={isDisabled}
                            className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                              editedBooking.numberOfPeople === num
                                ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                                : isDisabled
                                ? "bg-gray-200 dark:bg-zinc-900 text-gray-400 dark:text-zinc-600 cursor-not-allowed"
                                : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
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
                <MeetingPointAutocomplete
                  value={editedBooking.pickupLocation || ""}
                  onChange={(value) => setEditedBooking({ ...editedBooking, pickupLocation: value })}
                />

                {/* Booking Source */}
                <BookingSourceAutocomplete
                  value={editedBooking.bookingSource}
                  onChange={(value) => setEditedBooking({ ...editedBooking, bookingSource: value })}
                  label="Booking Source"
                />

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Phone Number</Label>
                  <Input
                    type="tel"
                    value={editedBooking.phoneNumber || ""}
                    onChange={(e) => setEditedBooking({ ...editedBooking, phoneNumber: e.target.value })}
                    autoComplete="off"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">Email</Label>
                  <Input
                    type="email"
                    value={editedBooking.email || ""}
                    onChange={(e) => setEditedBooking({ ...editedBooking, email: e.target.value })}
                    autoComplete="off"
                  />
                </div>

                {/* Additional Options - Collapsible */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowAdditionalOptions(!showAdditionalOptions)}
                    className="flex items-center justify-between w-full text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <span className="text-sm font-medium">Additional Options</span>
                    {showAdditionalOptions ? (
                      <ChevronUp className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
                    )}
                  </button>

                  {showAdditionalOptions && (
                    <div className="space-y-4 pt-2 border-t border-gray-300 dark:border-zinc-800">
                      {/* Commission (Optional) */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 dark:text-white">
                          Commission (per person)
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editedBooking.commission ?? ""}
                          onChange={(e) => setEditedBooking({ ...editedBooking, commission: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="0.00"
                          autoComplete="off"
                        />
                      </div>

                      {/* Commission Status */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 dark:text-white">
                          Commission Status
                        </Label>
                        <select
                          value={editedBooking.commissionStatus || "unpaid"}
                          onChange={(e) => setEditedBooking({ ...editedBooking, commissionStatus: e.target.value as "paid" | "unpaid" })}
                          className="flex h-10 w-full rounded-md border border-gray-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white ring-offset-white dark:ring-offset-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white focus-visible:ring-offset-2"
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>

                      {/* Lady Pilots Required */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 dark:text-white">
                          Lady Pilots Required
                          {availableFemalePilots > 0 && (
                            <span className="text-xs text-gray-600 dark:text-zinc-400 ml-2">
                              ({availableFemalePilots} available)
                            </span>
                          )}
                        </Label>
                        <div className="overflow-x-auto">
                          <div className="flex gap-2 pb-2">
                            {Array.from({ length: Math.min(editedBooking.numberOfPeople || 0, availableFemalePilots) + 1 }, (_, i) => i).map((num) => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setEditedBooking({ ...editedBooking, femalePilotsRequired: num })}
                                className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                                  (editedBooking.femalePilotsRequired ?? 0) === num
                                    ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                                    : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                                }`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Flight Type */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 dark:text-white">
                          Flight Type
                        </Label>
                        <div className="flex gap-2">
                          {([
                            { type: "sensational", price: "CHF 180" },
                            { type: "classic", price: "CHF 170" },
                            { type: "early bird", price: "CHF 180" }
                          ] as const).map(({ type, price }) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setEditedBooking({ ...editedBooking, flightType: type })}
                              className={`flex-1 px-3 py-3 rounded-lg font-medium transition-colors ${
                                (editedBooking.flightType || "sensational") === type
                                  ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                                  : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                              }`}
                            >
                              <div className="capitalize text-sm">{type}</div>
                              <div className="text-xs mt-1 opacity-80">{price}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Additional Notes (Optional) */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 dark:text-white">
                          Additional Notes
                        </Label>
                        <Textarea
                          value={editedBooking.notes || ""}
                          onChange={(e) => setEditedBooking({ ...editedBooking, notes: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              {!isEditing ? (
                <>
                  {/* Show Edit/Delete only for non-deleted bookings */}
                  {booking?.bookingStatus !== 'deleted' && (
                    <>
                      {canEditBooking(booking?.createdBy) && canEditBookingDetails && (
                        <Button
                          onClick={handleEdit}
                          className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
                        >
                          Edit
                        </Button>
                      )}
                      {canEditBooking(booking?.createdBy) && !canEditBookingDetails && (
                        <div className="flex-1 text-center text-sm text-gray-500 dark:text-zinc-500 py-2">
                          Editing disabled (booking is more than 24 hours old)
                        </div>
                      )}
                      {canDeleteBooking(booking?.createdBy) && canEditBookingDetails && (
                        <Button
                          onClick={handleDelete}
                          variant="outline"
                          className="flex-1 border-red-600 dark:border-red-700 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-400"
                        >
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                  {/* Show Restore button for deleted bookings */}
                  {booking?.bookingStatus === 'deleted' && onUpdate && booking.id && (
                    <Button
                      onClick={() => {
                        onUpdate(booking.id!, { bookingStatus: 'pending' });
                        handleOpenChange(false);
                      }}
                      className="flex-1 bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600"
                    >
                      Restore
                    </Button>
                  )}
                  <Button
                    onClick={() => handleOpenChange(false)}
                    variant="outline"
                    className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={role !== 'admin' && availableSlots < editedBooking.numberOfPeople}
                    className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 dark:disabled:hover:bg-white"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          {role !== 'agency' && role !== 'driver' && (
            <TabsContent value="payment" className="space-y-4 max-h-[60vh] overflow-y-auto">
            {sortedPilotPayments.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-zinc-500">
                <p>No pilots assigned to this booking</p>
              </div>
            ) : (
              <>
                {sortedPilotPayments.map((payment, index) => {
                  const isCurrentUser = payment.pilotName === currentUser?.displayName;
                  return (<div
                    key={payment.pilotName}
                    className={`border rounded-lg p-4 space-y-4 ${
                      isCurrentUser
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        : "border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50"
                    }`}
                  >
                    {/* Pilot Name Header */}
                    <div className="flex items-center justify-between border-b border-gray-300 dark:border-zinc-700 pb-2">
                      <h3 className="text-gray-900 dark:text-white font-medium">
                        {payment.pilotName}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">You</span>
                        )}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-zinc-500">Pilot #{index + 1}</span>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-gray-900 dark:text-white">Amount</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={payment.amount}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty string, negative sign, and valid numbers (including negative decimals)
                          if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
                            handlePaymentUpdate(payment.pilotName, 'amount', value === '' || value === '-' ? value : (value.endsWith('.') || value === '-.' ? value : parseFloat(value) || value));
                          }
                        }}
                        placeholder="0.00"
                        autoComplete="off"
                        disabled={!canEditPaymentDetails}
                        className={!canEditPaymentDetails ? 'opacity-50 cursor-not-allowed' : ''}
                      />
                    </div>

                    {/* Payment Method Buttons */}
                    <div className="space-y-2">
                      <Label className="text-gray-900 dark:text-white">Payment Method</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => canEditPaymentDetails && handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'direkt')}
                          disabled={!canEditPaymentDetails}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            !canEditPaymentDetails
                              ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white"
                              : payment.paymentMethod === 'direkt'
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                              : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          Direkt
                        </button>
                        <button
                          type="button"
                          onClick={() => canEditPaymentDetails && handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'ticket')}
                          disabled={!canEditPaymentDetails}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            !canEditPaymentDetails
                              ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white"
                              : payment.paymentMethod === 'ticket'
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                              : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          Ticket
                        </button>
                        <button
                          type="button"
                          onClick={() => canEditPaymentDetails && handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'ccp')}
                          disabled={!canEditPaymentDetails}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            !canEditPaymentDetails
                              ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white"
                              : payment.paymentMethod === 'ccp'
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                              : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          CCP
                        </button>
                      </div>
                    </div>

                    {/* Conditional Image Upload for Ticket/CCP */}
                    {(payment.paymentMethod === 'ticket' || payment.paymentMethod === 'ccp') && (
                      <div className="space-y-3">
                        <Label className="text-gray-900 dark:text-white">Receipts/Tickets</Label>

                        {/* Upload Buttons */}
                        <div className="flex gap-2">
                          {/* Camera Button */}
                          <label className={`flex-1 ${uploadingReceipt === payment.pilotName || !canEditPaymentDetails ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload(payment.pilotName, file);
                                  e.target.value = '';
                                }
                              }}
                              className="hidden"
                              disabled={uploadingReceipt === payment.pilotName || !canEditPaymentDetails}
                            />
                            <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                              uploadingReceipt === payment.pilotName || !canEditPaymentDetails
                                ? 'bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white cursor-not-allowed'
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 cursor-pointer'
                            }`}>
                              {uploadingReceipt === payment.pilotName ? (
                                <>
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  <span>Uploading...</span>
                                </>
                              ) : (
                                <>
                                  <Camera className="w-5 h-5" />
                                  <span>Camera</span>
                                </>
                              )}
                            </div>
                          </label>

                          {/* Upload Button */}
                          <label className={`flex-1 ${uploadingReceipt === payment.pilotName || !canEditPaymentDetails ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload(payment.pilotName, file);
                                  e.target.value = '';
                                }
                              }}
                              className="hidden"
                              disabled={uploadingReceipt === payment.pilotName || !canEditPaymentDetails}
                            />
                            <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                              uploadingReceipt === payment.pilotName || !canEditPaymentDetails
                                ? 'bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-white cursor-not-allowed'
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 cursor-pointer'
                            }`}>
                              {uploadingReceipt === payment.pilotName ? (
                                <>
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  <span>Uploading...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-5 h-5" />
                                  <span>Upload</span>
                                </>
                              )}
                            </div>
                          </label>
                        </div>

                        {/* Receipt Files List */}
                        {payment.receiptFiles && payment.receiptFiles.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {payment.receiptFiles.map((file, fileIndex) => (
                              <div
                                key={fileIndex}
                                className="flex items-center justify-between bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 border border-gray-300 dark:border-zinc-700"
                              >
                                <span className="text-gray-900 dark:text-white text-sm truncate flex-1 mr-3">
                                  {file.filename}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(file.url || file.data || "")}
                                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                    title="Preview"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {/* Only show delete button if user is admin or if it's their own receipt and they can edit */}
                                  {(role === 'admin' || (currentUser?.displayName === payment.pilotName && canEditPaymentDetails)) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveReceipt(payment.pilotName, fileIndex)}
                                      className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>);
                })}

                {/* Save Button */}
                <div className="pt-4 sticky bottom-0 bg-white dark:bg-zinc-950 pb-2">
                  <Button
                    onClick={handleSavePayments}
                    disabled={isSavingPayments || !canEditPaymentDetails}
                    className="w-full bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingPayments ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Payment Details"
                    )}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
          )}
        </Tabs>
      </DialogContent>

      {/* Image Preview Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">Receipt Preview</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4">
              <img
                src={previewImage}
                alt="Receipt preview"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setPreviewImage(null)}
                variant="outline"
                className="border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Email Preview Modal */}
      {editedBooking?.email && (
        <EmailPreviewModal
          open={showEmailPreview}
          onOpenChange={setShowEmailPreview}
          booking={{
            email: editedBooking.email,
            customerName: editedBooking.customerName || '',
            numberOfPeople: editedBooking.numberOfPeople,
            date: editedBooking.date,
            time: timeOverrides[editedBooking.timeIndex] || timeSlots[editedBooking.timeIndex],
            pickupLocation: editedBooking.pickupLocation,
          }}
          senderName={currentUser?.displayName || ''}
        />
      )}

      {/* No Show Pilot Payment Dialog */}
      {showNoShowDialog && (
        <Dialog open={showNoShowDialog} onOpenChange={setShowNoShowDialog}>
          <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white text-xl font-semibold">No Show - Pilot Payment</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700 dark:text-zinc-300 text-base mb-6">
                Will the pilots be paid for this flight?
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleNoShowPilotPayment(true)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3"
                >
                  Yes, Pay Pilots
                </Button>
                <Button
                  onClick={() => handleNoShowPilotPayment(false)}
                  variant="outline"
                  className="flex-1 border-2 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 font-medium py-3"
                >
                  No, Don't Pay
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-4">
                • If yes: Payment set to -103 CHF (ticket method)<br/>
                • If no: All pilots will be unassigned
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
