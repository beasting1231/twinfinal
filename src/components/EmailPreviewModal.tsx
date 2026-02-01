import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Send, X } from "lucide-react";
import { collection, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

interface EmailPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    email: string;
    customerName: string;
    numberOfPeople: number;
    date: string;
    time: string;
    pickupLocation?: string;
  };
  senderName?: string;
}

export function EmailPreviewModal({
  open,
  onOpenChange,
  booking,
  senderName,
}: EmailPreviewModalProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askWeightAge, setAskWeightAge] = useState(true);

  // Check if booking is today or tomorrow (don't show "contact us one day before" message)
  const isBookingSoon = (() => {
    const bookingDate = new Date(booking.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return bookingDate.getTime() === today.getTime() || bookingDate.getTime() === tomorrow.getTime();
  })();

  // Generate default message text
  const getDefaultMessage = (includeWeightAge: boolean) => {
    const weightAgeText = includeWeightAge
      ? `\n\nWhat is the weight and age of the passenger${booking.numberOfPeople > 1 ? 's' : ''} please?`
      : '';
    const weatherText = !isBookingSoon
      ? '\n\nand please contact us one day before to confirm wind and weather conditions.'
      : '';
    const signOff = senderName
      ? `\n\nKind regards,\n${senderName},\nTwin Paragliding`
      : '\n\nKind regards,\nTwin Paragliding';

    return `Does that all look correct?${weightAgeText}${weatherText}${signOff}`;
  };

  const [customMessage, setCustomMessage] = useState(() => getDefaultMessage(true));

  // Update message when askWeightAge changes
  const handleAskWeightAgeChange = (checked: boolean) => {
    setAskWeightAge(checked);
    // Update the message to add/remove the weight/age question
    const currentMessage = customMessage;
    const weightAgeRegex = /\n\nWhat is the weight and age of the passenger[s]? please\?/;

    if (checked && !weightAgeRegex.test(currentMessage)) {
      // Add weight/age question after "Does that all look correct?"
      const insertPoint = currentMessage.indexOf('Does that all look correct?');
      if (insertPoint !== -1) {
        const afterQuestion = insertPoint + 'Does that all look correct?'.length;
        const newMessage =
          currentMessage.slice(0, afterQuestion) +
          `\n\nWhat is the weight and age of the passenger${booking.numberOfPeople > 1 ? 's' : ''} please?` +
          currentMessage.slice(afterQuestion);
        setCustomMessage(newMessage);
      }
    } else if (!checked) {
      // Remove weight/age question
      setCustomMessage(currentMessage.replace(weightAgeRegex, ''));
    }
  };

  const formattedDate = new Date(booking.date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Map pickup location codes to readable names
  const locationMap: Record<string, string> = {
    "HW": "our base in Interlaken (Höheweg 95)",
    "OST": "Train Station Interlaken Ost (outside BIG coop supermarket)",
    "mhof": "Mattenhof Resort",
  };
  const locationText = locationMap[booking.pickupLocation || ""] ||
    booking.pickupLocation ||
    "the agreed meeting point";

  // Additional location details for HW
  const hwLocationDetails = booking.pickupLocation === "HW" ?
    "Our meeting spot is in Interlaken, behind the souvenir store called Heimatwerk just on the right side of Hotel Hapimag. (Höheweg 95)" : null;
  const hwMapLink = "https://goo.gl/maps/QvLGnNiXHp427gwM8";

  // Calculate pickup time (10 minutes earlier) for OST and mhof
  const getPickupTime = () => {
    if (booking.pickupLocation !== "OST" && booking.pickupLocation !== "mhof") return "";
    const [hours, minutes] = booking.time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes - 10;
    const pickupHours = Math.floor(totalMinutes / 60);
    const pickupMins = totalMinutes % 60;
    return `${pickupHours}:${pickupMins.toString().padStart(2, "0")}`;
  };
  const pickupTimeText = getPickupTime();

  const handleSend = async () => {
    setSending(true);
    setError(null);

    try {
      // Add to emailQueue collection - Cloud Function will pick it up and send
      const docRef = await addDoc(collection(db, "emailQueue"), {
        type: "bookingConfirmation",
        to: booking.email,
        customerName: booking.customerName,
        numberOfPeople: booking.numberOfPeople,
        date: booking.date,
        time: booking.time,
        pickupLocation: booking.pickupLocation,
        senderName: senderName || '',
        customMessage,
        status: "pending",
        createdAt: new Date(),
      });

      // Listen for real-time updates to the document
      let unsubscribe: (() => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        timeoutId = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          setSending(false);
          setError("Email sending timed out. Please check if the email was received.");
        }, 30000); // 30 second timeout

        unsubscribe = onSnapshot(
          docRef,
          (docSnap) => {
            const data = docSnap.data();

            if (data?.status === "sent") {
              if (timeoutId) clearTimeout(timeoutId);
              if (unsubscribe) unsubscribe();
              setSent(true);
              setSending(false);
              setTimeout(() => {
                onOpenChange(false);
                setSent(false);
              }, 2000);
            } else if (data?.status === "failed") {
              if (timeoutId) clearTimeout(timeoutId);
              if (unsubscribe) unsubscribe();
              setSending(false);
              setError(data.error || "Failed to send email. The email was queued but the server couldn't send it.");
            }
          },
          (error) => {
            console.error("Snapshot error:", error);
            if (timeoutId) clearTimeout(timeoutId);
            setSending(false);
            // Show success message anyway since the email was queued
            // The Cloud Function will handle sending it
            setSent(true);
            setTimeout(() => {
              onOpenChange(false);
              setSent(false);
            }, 2000);
          }
        );
      } catch (error: any) {
        console.error("Failed to set up listener:", error);
        if (timeoutId) clearTimeout(timeoutId);
        setSending(false);
        // Show success since email was queued
        setSent(true);
        setTimeout(() => {
          onOpenChange(false);
          setSent(false);
        }, 2000);
      }

    } catch (err) {
      console.error("Error queueing email:", err);
      setError("Failed to queue email. Please try again.");
      setSending(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSent(false);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-gray-900 dark:text-white flex items-center justify-between">
            <span>Email Preview</span>
            <span className="text-sm font-normal text-gray-500 dark:text-zinc-400">
              To: {booking.email}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Email Preview */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-zinc-900 rounded-lg p-4">
          <div className="bg-white rounded-xl shadow-sm max-w-[500px] mx-auto overflow-hidden">
            {/* Logo */}
            <div className="text-center py-6 px-4">
              <img
                src="/logo.png"
                alt="Twin Paragliding Logo"
                className="h-24 mx-auto"
              />
            </div>

            {/* Header */}
            <div className="text-center py-4 px-4 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">Your Flight is Booked!</h1>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-700">
                Hi <strong>{booking.customerName.split(' ')[0] || booking.customerName}</strong>!
              </p>

              <p className="text-gray-700">
                Please review your booking details:
              </p>

              {/* Booking Details Box */}
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-300 rounded-xl p-5">
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td className="py-3 border-b border-blue-200/50">
                        <span className="text-gray-500 text-xs block">Date</span>
                        <strong className="text-blue-800">{formattedDate}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 border-b border-blue-200/50">
                        <span className="text-gray-500 text-xs block">Time</span>
                        <strong className="text-blue-800">{booking.time}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 border-b border-blue-200/50">
                        <span className="text-gray-500 text-xs block">Number of Passengers</span>
                        <strong className="text-blue-800">{booking.numberOfPeople}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3">
                        <span className="text-gray-500 text-xs block">Pickup Location</span>
                        <strong className="text-blue-800">{locationText}</strong>
                        {hwLocationDetails && (
                          <span className="block text-gray-700 text-sm mt-2">
                            {hwLocationDetails}
                            <img
                              src="/hw-meetingpoint.jpeg"
                              alt="HW Meeting Point"
                              className="mt-3 rounded-lg w-full max-w-[300px]"
                            />
                            <a
                              href={hwMapLink}
                              className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              📍 View on Google Maps
                            </a>
                          </span>
                        )}
                        {(booking.pickupLocation === "OST" || booking.pickupLocation === "mhof") && (
                          <span className="block text-red-600 text-base font-semibold mt-1">
                            ⏰ Pickup is 10 minutes before flight time, so at {pickupTimeText}!
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Editable message area */}
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full text-gray-700 bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded-lg p-2 -m-2 resize-none transition-colors outline-none"
                style={{ minHeight: '150px', lineHeight: '1.6' }}
                placeholder="Enter your message..."
              />
            </div>

            {/* Footer */}
            <div className="text-center py-4 px-4 border-t border-gray-200 text-sm text-gray-500">
              <div><strong>Twin Paragliding</strong> — Discover why birds sing</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 pt-4 space-y-3">
          {/* Toggle for weight/age question */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={askWeightAge}
              onChange={(e) => handleAskWeightAgeChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 dark:bg-zinc-800"
            />
            <span className="text-sm text-gray-700 dark:text-zinc-300">
              Ask for weight and age of passengers
            </span>
          </label>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {sent ? (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-center">
              <span className="text-lg">✓</span> Email sent successfully!
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending email...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
