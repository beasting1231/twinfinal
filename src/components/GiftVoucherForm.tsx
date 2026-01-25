import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { CountryCodeSelect } from "./CountryCodeSelect";

const FLIGHT_OPTIONS = [
  { value: "sensational", label: "The Sensational (Beatenberg - Interlaken 1370m) CHF 180.--" },
  { value: "classic", label: "The Classic (Beatenberg - Interlaken 1060m) CHF 170.--" },
  { value: "romantic", label: "The Romantic (Niederhorn - Interlaken 1900m) CHF 200.--" },
  { value: "spectacular", label: "The Spectacular (Schynige Platte - Interlaken 1600m) CHF 220.--" },
];

export function GiftVoucherForm() {
  const [formData, setFormData] = useState({
    deliveryMethod: "" as "pdf" | "post" | "",
    recipientName: "",
    firstName: "",
    lastName: "",
    phone: "",
    phoneCountryCode: "+41",
    email: "",
    street: "",
    postCode: "",
    city: "",
    businessName: "",
    comments: "",
    flightType: "",
    photoPackage: "" as "yes" | "no" | "",
    transport: "" as "yes" | "no" | "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submittedName, setSubmittedName] = useState("");

  // Check if transport question should be shown (only for Romantic or Spectacular)
  const showTransportQuestion = formData.flightType === "romantic" || formData.flightType === "spectacular";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Combine country code and phone number
      const fullPhoneNumber = formData.phone
        ? `${formData.phoneCountryCode} ${formData.phone}`.trim()
        : "";

      // Calculate total price
      const flightOption = FLIGHT_OPTIONS.find(f => f.value === formData.flightType);
      const basePrice = flightOption?.label.match(/CHF (\d+)/)?.[1] || "0";
      let totalPrice = parseInt(basePrice);
      if (formData.photoPackage === "yes") totalPrice += 40;
      if (showTransportQuestion && formData.transport === "yes") totalPrice += 30;

      const voucherData = {
        deliveryMethod: formData.deliveryMethod,
        recipientName: formData.recipientName,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: fullPhoneNumber,
        phoneCountryCode: formData.phoneCountryCode,
        email: formData.email,
        street: formData.street,
        postCode: formData.postCode,
        city: formData.city,
        businessName: formData.businessName,
        comments: formData.comments,
        flightType: formData.flightType,
        photoPackage: formData.photoPackage === "yes",
        transport: showTransportQuestion ? formData.transport === "yes" : false,
        totalPrice,
        status: "pending",
        createdAt: new Date(),
      };

      await addDoc(collection(db, "giftVouchers"), voucherData);

      setSubmittedName(formData.firstName);
      setSubmissionSuccess(true);
    } catch (error) {
      console.error("Error submitting gift voucher order:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // WhatsApp contact
  const whatsappNumber = "+41796225100";
  const whatsappMessage = `Hi! I just ordered a gift voucher under the name ${submittedName}`;
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\+/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(whatsappUrl)}`;

  // Success screen
  if (submissionSuccess) {
    return (
      <div className="gift-voucher-form bg-gray-50 min-h-screen flex items-center justify-center px-4 py-6 sm:py-12">
        <div className="max-w-2xl w-full text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Thank You for Your Gift Voucher Order!
          </h1>
          <p className="text-gray-600 text-base sm:text-lg mb-6 sm:mb-8">
            We have received your order and will process it shortly.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-6 sm:mb-8">
            <p className="text-blue-800 text-xs sm:text-sm">
              <strong>Questions?</strong> Contact us directly on WhatsApp for fast support.
            </p>
          </div>

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
    <div className="gift-voucher-form bg-gray-50 flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="max-w-2xl w-full">
        <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-6 sm:mb-10">Order Gift Voucher</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Delivery Method */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              How would you like to receive your gift voucher? *
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="pdf"
                  checked={formData.deliveryMethod === "pdf"}
                  onChange={() => setFormData((prev) => ({ ...prev, deliveryMethod: "pdf" }))}
                  className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                  required
                />
                <span className="text-gray-900">PDF to print at home</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="post"
                  checked={formData.deliveryMethod === "post"}
                  onChange={() => setFormData((prev) => ({ ...prev, deliveryMethod: "post" }))}
                  className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                />
                <span className="text-gray-900">Post (Only within Switzerland)</span>
              </label>
            </div>
          </div>

          {/* Recipient Name */}
          <div className="space-y-2">
            <label htmlFor="recipientName" className="text-sm font-medium text-gray-700">
              Who is this gift voucher for?
            </label>
            <Input
              id="recipientName"
              name="recipientName"
              type="text"
              value={formData.recipientName}
              onChange={handleChange}
              placeholder="Add a name for a personalized voucher"
              className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
            />
          </div>

          {/* Invoice & Gift Voucher Section */}
          <div className="pt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice & Gift Voucher to be sent to:</h2>

            {/* First Name and Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                  First name *
                </label>
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                  Last name *
                </label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2 mb-4">
              <label htmlFor="phone" className="text-sm font-medium text-gray-700">
                Phone *
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
                  required
                  placeholder="eg. +41 79 622 5100"
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400 flex-1"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2 mb-4">
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
                className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
              />
            </div>

            {/* Street and Post Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label htmlFor="street" className="text-sm font-medium text-gray-700">
                  Street & House | Apartment Number *
                </label>
                <Input
                  id="street"
                  name="street"
                  type="text"
                  value={formData.street}
                  onChange={handleChange}
                  required
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="postCode" className="text-sm font-medium text-gray-700">
                  Post Code | PLZ *
                </label>
                <Input
                  id="postCode"
                  name="postCode"
                  type="text"
                  value={formData.postCode}
                  onChange={handleChange}
                  required
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
            </div>

            {/* City and Business Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label htmlFor="city" className="text-sm font-medium text-gray-700">
                  City | Town *
                </label>
                <Input
                  id="city"
                  name="city"
                  type="text"
                  value={formData.city}
                  onChange={handleChange}
                  required
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="businessName" className="text-sm font-medium text-gray-700">
                  Business name
                </label>
                <Input
                  id="businessName"
                  name="businessName"
                  type="text"
                  value={formData.businessName}
                  onChange={handleChange}
                  placeholder="If required"
                  className="!bg-white !border-gray-300 !text-gray-900 placeholder:!text-gray-400"
                />
              </div>
            </div>

            {/* Additional Comments */}
            <div className="space-y-2 mb-4">
              <label htmlFor="comments" className="text-sm font-medium text-gray-700">
                Additional Comments
              </label>
              <textarea
                id="comments"
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                rows={3}
                placeholder="If required"
                className="w-full px-3 py-2 !bg-white !border !border-gray-300 rounded !text-gray-900 placeholder:!text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Flight Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Choose Paragliding Flight *
            </label>
            <Select
              value={formData.flightType}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, flightType: value, transport: "" }))}
              required
            >
              <SelectTrigger className="!bg-white !border-gray-300 !text-gray-900">
                <SelectValue placeholder="Select a flight" />
              </SelectTrigger>
              <SelectContent className="!bg-white !border-gray-200 !text-gray-900">
                {FLIGHT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="!text-gray-900 focus:!bg-gray-100 focus:!text-gray-900"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Photo & Video Package */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Would you like to add the Photo & Video package? *
            </label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="photoPackage"
                  value="yes"
                  checked={formData.photoPackage === "yes"}
                  onChange={() => setFormData((prev) => ({ ...prev, photoPackage: "yes" }))}
                  className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                  required
                />
                <span className="text-gray-900">Yes! Add the photo & video package for CHF 40.--</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="photoPackage"
                  value="no"
                  checked={formData.photoPackage === "no"}
                  onChange={() => setFormData((prev) => ({ ...prev, photoPackage: "no" }))}
                  className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                />
                <span className="text-gray-900">No Thank you</span>
              </label>
            </div>
          </div>

          {/* Transport Note */}
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
            <p className="text-gray-700 text-sm font-medium">
              Please note: Transport to the take off is included in the price for THE SENSATIONAL and also THE CLASSIC flights.
            </p>
          </div>

          {/* Transport Option (only for Romantic or Spectacular) */}
          {showTransportQuestion && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Transport for ROMANTIC or SPECTACULAR flights
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="transport"
                    value="yes"
                    checked={formData.transport === "yes"}
                    onChange={() => setFormData((prev) => ({ ...prev, transport: "yes" }))}
                    className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                    required
                  />
                  <span className="text-gray-900">Please include transport for an additional CHF 30.--</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="transport"
                    value="no"
                    checked={formData.transport === "no"}
                    onChange={() => setFormData((prev) => ({ ...prev, transport: "no" }))}
                    className="w-4 h-4 text-gray-900 border-gray-300 focus:ring-gray-500"
                  />
                  <span className="text-gray-900">No Thank you</span>
                </label>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full !bg-gray-900 !text-white hover:!bg-gray-800 mt-8 py-6 text-base font-medium"
          >
            {submitting ? "Processing..." : "ORDER GIFT VOUCHER"}
          </Button>
        </form>
      </div>
    </div>
  );
}
