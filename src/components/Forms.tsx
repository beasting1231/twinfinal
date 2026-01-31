import { useState, useEffect } from "react";
import { Copy, ExternalLink, Check, Plus, X, Download } from "lucide-react";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc } from "firebase/firestore";
import QRCode from "qrcode";
import { db } from "../firebase/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

interface Form {
  id: string;
  name: string;
  commissionRate: number;
  hideAvailability: boolean;
  onlySensational: boolean;
  requireTermsAndConditions: boolean;
  createdAt: Date;
}

const defaultMainForm: Form = {
  id: "main",
  name: "Main Booking Form",
  commissionRate: 0,
  hideAvailability: false,
  onlySensational: false,
  requireTermsAndConditions: false,
  createdAt: new Date(0),
};

export function Forms() {
  const [forms, setForms] = useState<Form[]>([defaultMainForm]);
  const [copiedStates, setCopiedStates] = useState<Record<string, 'url' | 'iframe' | null>>({});
  const [savingSettings, setSavingSettings] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [newFormCommission, setNewFormCommission] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Load form settings and additional forms on mount
  useEffect(() => {
    const loadForms = async () => {
      let hideAvailability = false;
      let onlySensational = false;
      let requireTermsAndConditions = false;

      try {
        const settingsDoc = await getDoc(doc(db, "settings", "form"));
        if (settingsDoc.exists()) {
          hideAvailability = settingsDoc.data().hideAvailability ?? false;
          onlySensational = settingsDoc.data().onlySensational ?? false;
          requireTermsAndConditions = settingsDoc.data().requireTermsAndConditions ?? false;
        }
      } catch (error) {
        console.error("Error loading main form settings:", error);
      }

      const mainForm: Form = {
        id: "main",
        name: "Main Booking Form",
        commissionRate: 0,
        hideAvailability,
        onlySensational,
        requireTermsAndConditions,
        createdAt: new Date(0),
      };

      // Load additional forms
      let additionalForms: Form[] = [];
      try {
        const formsSnapshot = await getDocs(collection(db, "bookingForms"));
        additionalForms = formsSnapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            commissionRate: data.commissionRate || 0,
            hideAvailability: data.hideAvailability ?? false,
            onlySensational: data.onlySensational ?? false,
            requireTermsAndConditions: data.requireTermsAndConditions ?? false,
            createdAt: data.createdAt?.toDate() || new Date(),
          };
        });
      } catch (error) {
        console.error("Error loading additional forms:", error);
      }

      setForms([mainForm, ...additionalForms.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())]);
    };
    loadForms();
  }, []);

  const handleToggleAvailability = async (formId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setSavingSettings(formId);

    // Optimistically update UI
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, hideAvailability: newValue } : f))
    );

    try {
      if (formId === "main") {
        await setDoc(doc(db, "settings", "form"), { hideAvailability: newValue }, { merge: true });
      } else {
        await setDoc(doc(db, "bookingForms", formId), { hideAvailability: newValue }, { merge: true });
      }
    } catch (error) {
      console.error("Error saving form settings:", error);
      // Revert on error
      setForms((prev) =>
        prev.map((f) => (f.id === formId ? { ...f, hideAvailability: currentValue } : f))
      );
    } finally {
      setSavingSettings(null);
    }
  };

  const handleToggleSensational = async (formId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setSavingSettings(formId + "-sensational");

    // Optimistically update UI
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, onlySensational: newValue } : f))
    );

    try {
      if (formId === "main") {
        await setDoc(doc(db, "settings", "form"), { onlySensational: newValue }, { merge: true });
      } else {
        await setDoc(doc(db, "bookingForms", formId), { onlySensational: newValue }, { merge: true });
      }
    } catch (error) {
      console.error("Error saving form settings:", error);
      // Revert on error
      setForms((prev) =>
        prev.map((f) => (f.id === formId ? { ...f, onlySensational: currentValue } : f))
      );
    } finally {
      setSavingSettings(null);
    }
  };

  const handleToggleTerms = async (formId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setSavingSettings(formId + "-terms");

    // Optimistically update UI
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, requireTermsAndConditions: newValue } : f))
    );

    try {
      if (formId === "main") {
        await setDoc(doc(db, "settings", "form"), { requireTermsAndConditions: newValue }, { merge: true });
      } else {
        await setDoc(doc(db, "bookingForms", formId), { requireTermsAndConditions: newValue }, { merge: true });
      }
    } catch (error) {
      console.error("Error saving form settings:", error);
      // Revert on error
      setForms((prev) =>
        prev.map((f) => (f.id === formId ? { ...f, requireTermsAndConditions: currentValue } : f))
      );
    } finally {
      setSavingSettings(null);
    }
  };

  const getFormUrls = (form: Form) => {
    const baseFormUrl = `${window.location.origin}/booking-request`;
    const embedUrl = `${window.location.origin}/embed/`;

    const params = new URLSearchParams();
    if (form.hideAvailability) params.set("hideAvailability", "true");
    if (form.id !== "main") params.set("formId", form.id);

    const queryString = params.toString();
    const formUrl = queryString ? `${baseFormUrl}?${queryString}` : baseFormUrl;
    const embedFormUrl = queryString ? `${embedUrl}?${queryString}` : embedUrl;
    const iframeCode = `<iframe src="${embedFormUrl}" width="100%" height="800" frameborder="0"></iframe>`;

    return { formUrl, iframeCode };
  };

  const copyToClipboard = async (text: string, formId: string, type: 'iframe' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates((prev) => ({ ...prev, [formId]: type }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [formId]: null }));
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim()) return;

    const commissionRate = parseFloat(newFormCommission) || 0;

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, "bookingForms"), {
        name: newFormName.trim(),
        commissionRate,
        hideAvailability: false,
        onlySensational: false,
        requireTermsAndConditions: false,
        createdAt: new Date(),
      });

      const newForm: Form = {
        id: docRef.id,
        name: newFormName.trim(),
        commissionRate,
        hideAvailability: false,
        onlySensational: false,
        requireTermsAndConditions: false,
        createdAt: new Date(),
      };

      setForms((prev) => [...prev, newForm]);
      setNewFormName("");
      setNewFormCommission("");
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error creating form:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (formId === "main") return;

    try {
      await deleteDoc(doc(db, "bookingForms", formId));
      setForms((prev) => prev.filter((f) => f.id !== formId));
    } catch (error) {
      console.error("Error deleting form:", error);
    }
  };

  const handleDownloadQRCode = async (url: string, formName: string) => {
    try {
      // Generate QR code as data URL with transparent background
      const dataUrl = await QRCode.toDataURL(url, {
        width: 1024,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#00000000", // Transparent background
        },
      });

      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${formName.replace(/\s+/g, "-").toLowerCase()}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-6 overflow-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Booking Forms</h1>

      <div className="max-w-3xl space-y-6">
        {forms.map((form) => {
          const { formUrl, iframeCode } = getFormUrls(form);
          const copiedState = copiedStates[form.id];

          return (
            <div
              key={form.id}
              className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">{form.name}</h3>
                  {form.id !== "main" && (
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      Commission: CHF {form.commissionRate.toFixed(2)} per person
                    </p>
                  )}
                </div>
                {form.id !== "main" && (
                  <button
                    onClick={() => handleDeleteForm(form.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                    title="Delete form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Direct Link */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Direct Link</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formUrl}
                    readOnly
                    className="flex-1 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(formUrl, form.id, "url")}
                    className="px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-1.5"
                  >
                    {copiedState === "url" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="text-sm">{copiedState === "url" ? "Copied!" : "Copy"}</span>
                  </button>
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="text-sm">Open</span>
                  </a>
                  <button
                    onClick={() => handleDownloadQRCode(formUrl, form.name)}
                    className="px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-1.5"
                    title="Download QR Code"
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-sm">QR</span>
                  </button>
                </div>
              </div>

              {/* Embed Code */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Embed Code</p>
                <div className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded p-3 mb-2">
                  <code className="text-green-600 dark:text-green-400 text-xs break-all font-mono">
                    {iframeCode}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(iframeCode, form.id, "iframe")}
                  className="px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-1.5"
                >
                  {copiedState === "iframe" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="text-sm">{copiedState === "iframe" ? "Copied!" : "Copy Embed Code"}</span>
                </button>
              </div>

              {/* Settings */}
              <div className="pt-4 border-t border-gray-200 dark:border-zinc-700 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Don't show availability</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      Customers won't see available spots
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleAvailability(form.id, form.hideAvailability)}
                    disabled={savingSettings === form.id}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      form.hideAvailability ? "bg-blue-600" : "bg-gray-300 dark:bg-zinc-600"
                    } ${savingSettings === form.id ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        form.hideAvailability ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Only sensational flight</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      Hide flight type selector, default to sensational
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleSensational(form.id, form.onlySensational)}
                    disabled={savingSettings === form.id + "-sensational"}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      form.onlySensational ? "bg-blue-600" : "bg-gray-300 dark:bg-zinc-600"
                    } ${savingSettings === form.id + "-sensational" ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        form.onlySensational ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Require terms and conditions</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      Add required checkbox for terms and conditions
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleTerms(form.id, form.requireTermsAndConditions)}
                    disabled={savingSettings === form.id + "-terms"}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      form.requireTermsAndConditions ? "bg-blue-600" : "bg-gray-300 dark:bg-zinc-600"
                    } ${savingSettings === form.id + "-terms" ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        form.requireTermsAndConditions ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Create Form Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-lg text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create New Form
        </button>
      </div>

      {/* Create Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Create New Form</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="form-name" className="text-gray-900 dark:text-white">
                Form Name
              </Label>
              <Input
                id="form-name"
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="e.g., Partner Website Form"
                className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="commission-rate" className="text-gray-900 dark:text-white">
                Commission Rate (per person)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-400 text-sm">
                  CHF
                </span>
                <Input
                  id="commission-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newFormCommission}
                  onChange={(e) => setNewFormCommission(e.target.value)}
                  placeholder="0.00"
                  className="pl-12 bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Commission charged per person for bookings through this form
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleCreateForm}
              disabled={!newFormName.trim() || isCreating}
              className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Form"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                setNewFormName("");
                setNewFormCommission("");
              }}
              className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
