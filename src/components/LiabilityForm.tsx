import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useAuth } from "../contexts/AuthContext";

type UILanguage = "en" | "de";

const getToday = () => new Date().toISOString().split("T")[0];

const content = {
  en: {
    title: "Liability Form",
    subtitle: "Please complete all fields, read the confirmation, and sign before submitting.",
    firstName: "First name",
    lastName: "Last name",
    place: "Place",
    date: "Date",
    language: "Language",
    english: "English",
    german: "German",
    confirmLabel: "I, the passenger listed above, confirm:",
    points: [
      "I have read and understood the terms and conditions.",
      "I have fully understood the flight instructions.",
      "I will always follow the pilot's instructions.",
      "I do not have any health issues that could affect safe flight operations.",
      "I understand that the flight involves risks (e.g., falls during take-off or landing).",
    ],
    signature: "Signature",
    signatureHint: "Tap the box to sign.",
    tapToSign: "Tap to add signature",
    tapToEdit: "Tap to edit signature",
    signatureModalTitle: "Add signature",
    clearSignature: "Clear",
    saveSignature: "Save signature",
    cancel: "Cancel",
    submit: "Submit",
    submitting: "Submitting...",
    success: "Liability form submitted successfully.",
    error: "Failed to submit form. Please try again.",
    requiredError: "Please fill all fields, accept the confirmation, and add a signature.",
  },
  de: {
    title: "Haftungsformular",
    subtitle: "Bitte alle Felder ausfüllen, die Bestätigung lesen und vor dem Absenden unterschreiben.",
    firstName: "Vorname",
    lastName: "Name",
    place: "Ort",
    date: "Datum",
    language: "Sprache",
    english: "Englisch",
    german: "Deutsch",
    confirmLabel: "Ich, die/der oben aufgeführte Passagier/in, gebe diese Bestätigung ab:",
    points: [
      "Ich habe die AGBs gelesen und verstanden.",
      "Ich habe die Instruktionen für den Flug vollständig verstanden.",
      "Ich befolge immer die Weisungen der Pilotin / des Piloten.",
      "Ich habe keine gesundheitlichen Probleme, die die sichere Durchführung des Fluges beeinträchtigen könnten.",
      "Ich bin mir bewusst, dass der Flug mit Risiken verbunden ist (bspw. Sturz beim Start oder Landung).",
    ],
    signature: "Unterschrift",
    signatureHint: "Auf das Feld tippen, um zu unterschreiben.",
    tapToSign: "Tippen zum Unterschreiben",
    tapToEdit: "Tippen zum Bearbeiten",
    signatureModalTitle: "Unterschrift hinzufügen",
    clearSignature: "Löschen",
    saveSignature: "Unterschrift speichern",
    cancel: "Abbrechen",
    submit: "Absenden",
    submitting: "Wird gesendet...",
    success: "Haftungsformular erfolgreich gesendet.",
    error: "Formular konnte nicht gesendet werden. Bitte erneut versuchen.",
    requiredError: "Bitte alle Felder ausfüllen, die Bestätigung akzeptieren und unterschreiben.",
  },
} as const;

export function LiabilityForm() {
  const { currentUser } = useAuth();
  const [uiLanguage, setUiLanguage] = useState<UILanguage>("en");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [place, setPlace] = useState("interlaken");
  const [date, setDate] = useState(getToday());
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  const t = content[uiLanguage];

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.floor(bounds.width * ratio);
    canvas.height = Math.floor(bounds.height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";

    if (signatureDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasSignatureRef.current = true;
      };
      img.src = signatureDataUrl;
    } else {
      hasSignatureRef.current = false;
    }
  };

  useEffect(() => {
    if (!isSignatureModalOpen) return;

    const raf = requestAnimationFrame(() => {
      setupCanvas();
    });

    window.addEventListener("resize", setupCanvas);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setupCanvas);
    };
  }, [isSignatureModalOpen, signatureDataUrl]);

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    isDrawingRef.current = true;
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = getCanvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    hasSignatureRef.current = true;
  };

  const handlePointerUp = (event?: PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
    isDrawingRef.current = false;
  };

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasSignatureRef.current = false;
  };

  const handleSaveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignatureRef.current) return;
    setSignatureDataUrl(canvas.toDataURL("image/png"));
    setIsSignatureModalOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!firstName.trim() || !lastName.trim() || !place.trim() || !date || !confirmed || !signatureDataUrl) {
      setMessage({ type: "error", text: t.requiredError });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "liabilityForms"), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        place: place.trim(),
        date,
        language: uiLanguage,
        confirmationAccepted: confirmed,
        signatureDataUrl,
        submittedByUid: currentUser?.uid ?? null,
        submittedByEmail: currentUser?.email ?? null,
        createdAt: serverTimestamp(),
      });

      setFirstName("");
      setLastName("");
      setPlace("interlaken");
      setDate(getToday());
      setConfirmed(false);
      setSignatureDataUrl(null);
      setMessage({ type: "success", text: t.success });
    } catch (error) {
      console.error("Failed to submit liability form:", error);
      setMessage({ type: "error", text: t.error });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-zinc-950 p-3 sm:p-4 md:p-6 overflow-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="w-full space-y-5 sm:space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.title}</h1>
          <p className="text-sm text-gray-600 dark:text-zinc-400">{t.subtitle}</p>
        </div>

        <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit} autoComplete="off">
          <div className="space-y-2">
            <Label htmlFor="liability-language" className="text-gray-900 dark:text-white">{t.language}</Label>
            <select
              id="liability-language"
              value={uiLanguage}
              onChange={(e) => setUiLanguage(e.target.value as UILanguage)}
              className="w-full h-11 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md px-3 py-2 text-base text-gray-900 dark:text-white"
            >
              <option value="en">{t.english}</option>
              <option value="de">{t.german}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-gray-900 dark:text-white">{t.firstName}</Label>
              <Input
                id="firstName"
                name="liability-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-11 text-base"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-gray-900 dark:text-white">{t.lastName}</Label>
              <Input
                id="lastName"
                name="liability-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-11 text-base"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="place" className="text-gray-900 dark:text-white">{t.place}</Label>
              <Input
                id="place"
                name="liability-place"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="h-11 text-base"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date" className="text-gray-900 dark:text-white">{t.date}</Label>
              <Input
                id="date"
                name="liability-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-4 space-y-4">
            <label className="flex items-start gap-3 sm:gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-6 w-6 shrink-0"
              />
              <div className="space-y-2">
                <p className="text-gray-900 dark:text-white font-medium">{t.confirmLabel}</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-zinc-300">
                  {t.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-white">{t.signature}</Label>
            <p className="text-sm text-gray-600 dark:text-zinc-400">{t.signatureHint}</p>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setIsSignatureModalOpen(true);
              }}
              className="w-full h-24 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 overflow-hidden flex items-center justify-center"
            >
              {signatureDataUrl ? (
                <img src={signatureDataUrl} alt={t.signature} className="w-full h-full object-contain" />
              ) : (
                <span className="text-gray-500 dark:text-zinc-400 text-sm">{t.tapToSign}</span>
              )}
            </button>
            {signatureDataUrl && (
              <p className="text-xs text-gray-500 dark:text-zinc-400">{t.tapToEdit}</p>
            )}
          </div>

          {message && (
            <div
              className={`text-sm px-3 py-2 rounded-md ${
                message.type === "success"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
            disabled={isSubmitting}
          >
            {isSubmitting ? t.submitting : t.submit}
          </Button>
        </form>
      </div>

      <Dialog open={isSignatureModalOpen} onOpenChange={setIsSignatureModalOpen}>
        <DialogContent className="w-[95vw] max-w-3xl bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">{t.signatureModalTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <canvas
              ref={canvasRef}
              className="w-full h-[52vh] sm:h-[55vh] border border-gray-300 dark:border-zinc-700 rounded-md bg-white touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button type="button" variant="outline" onClick={handleClearSignature} className="h-11">
                {t.clearSignature}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsSignatureModalOpen(false)} className="h-11">
                {t.cancel}
              </Button>
              <Button
                type="button"
                onClick={handleSaveSignature}
                className="h-11 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {t.saveSignature}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
