import { useState, useEffect } from "react";
import { Copy, ExternalLink, Check, Download, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";

const FLIGHT_OPTIONS = [
  { value: "sensational", label: "The Sensational: Beatenberg - Interlaken 1370m" },
  { value: "classic", label: "The Classic: Beatenberg - Interlaken 1060m" },
  { value: "romantic", label: "The Romantic: Niederhorn - Interlaken 1900m" },
  { value: "spectacular", label: "The Spectacular: Schynige Platte - Interlaken 1600m" },
];

const FONT_OPTIONS = [
  { value: "HelveticaBold", label: "Helvetica Bold" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "HelveticaOblique", label: "Helvetica Italic" },
  { value: "TimesRomanBold", label: "Times Bold" },
  { value: "TimesRoman", label: "Times Roman" },
  { value: "TimesRomanItalic", label: "Times Italic" },
  { value: "Courier", label: "Courier" },
  { value: "CourierBold", label: "Courier Bold" },
];

// Default styling values
const DEFAULT_STYLES = {
  // Colors (hex)
  blueColor: "#1a5a96",
  orangeColor: "#d97826",
  grayColor: "#a8a8a8",

  // Global text area position
  textAreaX: 80, // percentage from left (right alignment point)
  textAreaY: 40, // percentage from bottom (top line position)
  lineGap: 21, // pixels between lines

  // Header "GUTSCHEIN TICKET TO FLY"
  headerSize: 15,
  headerFont: "HelveticaBold",

  // Flight type
  flightSize: 14,
  flightFont: "HelveticaBold",

  // Photo package text
  photoSize: 14,
  photoFont: "HelveticaBold",

  // Voucher number
  voucherSize: 12,
  voucherFont: "HelveticaBold",

  // Footer
  footerSize: 12,
  footerFont: "HelveticaOblique",

  // Website
  websiteSize: 9,
  websiteFont: "HelveticaBold",
};

export function GiftVouchers() {
  const [copiedState, setCopiedState] = useState<'url' | 'iframe' | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showStyling, setShowStyling] = useState(false);

  // Preview controls
  const [flightType, setFlightType] = useState("sensational");
  const [photoPackage, setPhotoPackage] = useState(true);

  // Text styling state
  const [styles, setStyles] = useState(DEFAULT_STYLES);

  const updateStyle = <K extends keyof typeof DEFAULT_STYLES>(key: K, value: typeof DEFAULT_STYLES[K]) => {
    setStyles(prev => ({ ...prev, [key]: value }));
  };

  const formUrl = `${window.location.origin}/gift-voucher`;
  const embedUrl = `${window.location.origin}/embed-voucher/`;
  const iframeCode = `<iframe src="${embedUrl}" width="100%" height="1200" frameborder="0"></iframe>`;

  const copyToClipboard = async (text: string, type: 'iframe' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(type);
      setTimeout(() => {
        setCopiedState(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownloadQRCode = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(formUrl, {
        width: 1024,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#00000000",
        },
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "gift-voucher-form-qr-code.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  // Helper function to convert hex color to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return rgb(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      );
    }
    return rgb(0, 0, 0);
  };

  // Helper function to get font from name
  const getFontKey = (fontName: string): keyof typeof StandardFonts => {
    const fontMap: Record<string, keyof typeof StandardFonts> = {
      HelveticaBold: "HelveticaBold",
      Helvetica: "Helvetica",
      HelveticaOblique: "HelveticaOblique",
      TimesRomanBold: "TimesRomanBold",
      TimesRoman: "TimesRoman",
      TimesRomanItalic: "TimesRomanItalic",
      Courier: "Courier",
      CourierBold: "CourierBold",
    };
    return fontMap[fontName] || "HelveticaBold";
  };

  // Generate PDF preview
  const generatePdfPreview = async () => {
    setGenerating(true);
    try {
      const flightLabel = FLIGHT_OPTIONS.find(f => f.value === flightType)?.label || flightType;

      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();

      // Load the blank PNG template
      const templateResponse = await fetch("/gutschein-template.png");
      const templateBytes = await templateResponse.arrayBuffer();
      const templateImage = await pdfDoc.embedPng(templateBytes);

      // Get image dimensions (2480 x 1181 pixels)
      const imgWidth = templateImage.width;
      const imgHeight = templateImage.height;

      // Create a page with the same aspect ratio
      const scale = 0.29;
      const pageWidth = imgWidth * scale;
      const pageHeight = imgHeight * scale;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Draw the background image
      page.drawImage(templateImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // Embed all fonts we might need
      const fonts: Record<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {};
      const fontNames = ["HelveticaBold", "Helvetica", "HelveticaOblique", "TimesRomanBold", "TimesRoman", "TimesRomanItalic", "Courier", "CourierBold"];
      for (const fontName of fontNames) {
        fonts[fontName] = await pdfDoc.embedFont(StandardFonts[getFontKey(fontName)]);
      }

      // Colors from styling
      const blueColor = hexToRgb(styles.blueColor);
      const orangeColor = hexToRgb(styles.orangeColor);

      // Global positioning
      const rightMargin = pageWidth * (styles.textAreaX / 100);
      const startY = pageHeight * (styles.textAreaY / 100);
      const lineGap = styles.lineGap;

      // Track current line (0 = header, then increment for each line)
      let lineIndex = 0;

      // === HEADER: "VOUCHER TICKET TO FLY" ===
      const headerY = startY - (lineIndex * lineGap);
      const headerFont = fonts[styles.headerFont];

      const voucherHeaderText = "V O U C H E R   ";
      const voucherHeaderWidth = headerFont.widthOfTextAtSize(voucherHeaderText, styles.headerSize);

      const ticketText = "T I C K E T   T O   F L Y";
      const ticketWidth = headerFont.widthOfTextAtSize(ticketText, styles.headerSize);

      const totalHeaderWidth = voucherHeaderWidth + ticketWidth;
      const headerStartX = rightMargin - totalHeaderWidth;

      page.drawText(voucherHeaderText, {
        x: headerStartX,
        y: headerY,
        size: styles.headerSize,
        font: headerFont,
        color: orangeColor,
      });

      page.drawText(ticketText, {
        x: headerStartX + voucherHeaderWidth,
        y: headerY,
        size: styles.headerSize,
        font: headerFont,
        color: blueColor,
      });

      lineIndex++;

      // === FLIGHT TYPE ===
      const flightY = startY - (lineIndex * lineGap);
      const flightFont = fonts[styles.flightFont];
      const flightWidth = flightFont.widthOfTextAtSize(flightLabel, styles.flightSize);
      page.drawText(flightLabel, {
        x: rightMargin - flightWidth,
        y: flightY,
        size: styles.flightSize,
        font: flightFont,
        color: blueColor,
      });

      lineIndex++;

      // === PHOTO & VIDEO SERVICE (if included) ===
      if (photoPackage) {
        const photoText = "incl. Photo & Video";
        const photoY = startY - (lineIndex * lineGap);
        const photoFont = fonts[styles.photoFont];
        const photoWidth = photoFont.widthOfTextAtSize(photoText, styles.photoSize);
        page.drawText(photoText, {
          x: rightMargin - photoWidth,
          y: photoY,
          size: styles.photoSize,
          font: photoFont,
          color: orangeColor,
        });
        lineIndex++;
      }

      // === VOUCHER NUMBER ===
      const voucherText = "# 0 0 0 0 0 0";
      const voucherY = startY - (lineIndex * lineGap);
      const voucherFont = fonts[styles.voucherFont];
      const voucherWidth = voucherFont.widthOfTextAtSize(voucherText, styles.voucherSize);
      page.drawText(voucherText, {
        x: rightMargin - voucherWidth,
        y: voucherY,
        size: styles.voucherSize,
        font: voucherFont,
        color: blueColor,
      });

      lineIndex++;

      // === FOOTER ===
      const footerY = startY - (lineIndex * lineGap);
      const footerText = "Valid for 2 Years  |  Info & Booking: 079 622 5100";
      const footerFont = fonts[styles.footerFont];
      const footerWidth = footerFont.widthOfTextAtSize(footerText, styles.footerSize);
      page.drawText(footerText, {
        x: rightMargin - footerWidth,
        y: footerY,
        size: styles.footerSize,
        font: footerFont,
        color: blueColor,
      });

      lineIndex++;

      // === WEBSITE ===
      const websiteY = startY - (lineIndex * lineGap);
      const websiteText = "www.fly-twin.com";
      const websiteFont = fonts[styles.websiteFont];
      const websiteWidth = websiteFont.widthOfTextAtSize(websiteText, styles.websiteSize);
      page.drawText(websiteText, {
        x: rightMargin - websiteWidth,
        y: websiteY,
        size: styles.websiteSize,
        font: websiteFont,
        color: blueColor,
      });

      // Save and create URL
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      // Clean up old URL
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }

      setPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF preview:", error);
    } finally {
      setGenerating(false);
    }
  };

  // Generate preview on mount and when options change
  useEffect(() => {
    generatePdfPreview();
  }, [flightType, photoPackage, styles]);

  // Cleanup URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-6 overflow-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Gift Vouchers</h1>

      <div className="max-w-7xl w-full space-y-6">
        {/* PDF Preview Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Voucher Preview</h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                Live preview of the gift voucher PDF
              </p>
            </div>
            <button
              onClick={generatePdfPreview}
              disabled={generating}
              className="px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>
          </div>

          {/* Preview Controls */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Flight Type
              </label>
              <Select value={flightType} onValueChange={setFlightType}>
                <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLIGHT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Photo & Video Package
              </label>
              <div className="flex items-center gap-4 h-10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={photoPackage}
                    onChange={() => setPhotoPackage(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900 dark:text-white">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!photoPackage}
                    onChange={() => setPhotoPackage(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-900 dark:text-white">No</span>
                </label>
              </div>
            </div>
          </div>

          {/* Text Styling Controls */}
          <div className="border border-gray-200 dark:border-zinc-700 rounded-lg mb-4">
            <button
              onClick={() => setShowStyling(!showStyling)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-white">Text Styling Options</span>
              {showStyling ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {showStyling && (
              <div className="p-4 border-t border-gray-200 dark:border-zinc-700 space-y-6">
                {/* Colors Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Colors</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Blue (Flight, Website)</label>
                      <input
                        type="color"
                        value={styles.blueColor}
                        onChange={(e) => updateStyle("blueColor", e.target.value)}
                        className="w-full h-8 rounded cursor-pointer border border-gray-300 dark:border-zinc-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Orange (Header, Photo)</label>
                      <input
                        type="color"
                        value={styles.orangeColor}
                        onChange={(e) => updateStyle("orangeColor", e.target.value)}
                        className="w-full h-8 rounded cursor-pointer border border-gray-300 dark:border-zinc-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Gray (Voucher #, Footer)</label>
                      <input
                        type="color"
                        value={styles.grayColor}
                        onChange={(e) => updateStyle("grayColor", e.target.value)}
                        className="w-full h-8 rounded cursor-pointer border border-gray-300 dark:border-zinc-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Text Area Position */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Text Area Position</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        X Position: {styles.textAreaX}%
                      </label>
                      <Slider
                        value={[styles.textAreaX]}
                        onValueChange={([v]) => updateStyle("textAreaX", v)}
                        min={50}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Y Position: {styles.textAreaY}%
                      </label>
                      <Slider
                        value={[styles.textAreaY]}
                        onValueChange={([v]) => updateStyle("textAreaY", v)}
                        min={20}
                        max={80}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Line Gap: {styles.lineGap}px
                      </label>
                      <Slider
                        value={[styles.lineGap]}
                        onValueChange={([v]) => updateStyle("lineGap", v)}
                        min={10}
                        max={50}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Header Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Header (VOUCHER TICKET TO FLY)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.headerFont} onValueChange={(v) => updateStyle("headerFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.headerSize}pt
                      </label>
                      <Slider
                        value={[styles.headerSize]}
                        onValueChange={([v]) => updateStyle("headerSize", v)}
                        min={8}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Flight Type Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Flight Type</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.flightFont} onValueChange={(v) => updateStyle("flightFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.flightSize}pt
                      </label>
                      <Slider
                        value={[styles.flightSize]}
                        onValueChange={([v]) => updateStyle("flightSize", v)}
                        min={8}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Photo Package Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Photo & Video Text</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.photoFont} onValueChange={(v) => updateStyle("photoFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.photoSize}pt
                      </label>
                      <Slider
                        value={[styles.photoSize]}
                        onValueChange={([v]) => updateStyle("photoSize", v)}
                        min={8}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Voucher Number Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Voucher Number</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.voucherFont} onValueChange={(v) => updateStyle("voucherFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.voucherSize}pt
                      </label>
                      <Slider
                        value={[styles.voucherSize]}
                        onValueChange={([v]) => updateStyle("voucherSize", v)}
                        min={8}
                        max={30}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Footer</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.footerFont} onValueChange={(v) => updateStyle("footerFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.footerSize}pt
                      </label>
                      <Slider
                        value={[styles.footerSize]}
                        onValueChange={([v]) => updateStyle("footerSize", v)}
                        min={6}
                        max={20}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Website Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Website</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Font</label>
                      <Select value={styles.websiteFont} onValueChange={(v) => updateStyle("websiteFont", v)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                        Size: {styles.websiteSize}pt
                      </label>
                      <Slider
                        value={[styles.websiteSize]}
                        onValueChange={([v]) => updateStyle("websiteSize", v)}
                        min={6}
                        max={20}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Reset Button */}
                <div className="pt-2 border-t border-gray-200 dark:border-zinc-700">
                  <button
                    onClick={() => setStyles(DEFAULT_STYLES)}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PDF Preview - Full viewport width */}
          <div className="relative -mx-6 -mb-6">
            <div className="w-screen relative left-1/2 -translate-x-1/2 border-t border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-[70vh]"
                  title="Gift Voucher Preview"
                />
              ) : (
                <div className="w-full h-[70vh] flex items-center justify-center text-gray-500 dark:text-zinc-400">
                  {generating ? "Generating preview..." : "No preview available"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Embed Code Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Gift Voucher Order Form</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              Embed this form on your website for customers to order gift vouchers
            </p>
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
                onClick={() => copyToClipboard(formUrl, "url")}
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
                onClick={handleDownloadQRCode}
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
              onClick={() => copyToClipboard(iframeCode, "iframe")}
              className="px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-1.5"
            >
              {copiedState === "iframe" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{copiedState === "iframe" ? "Copied!" : "Copy Embed Code"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
