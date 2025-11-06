import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

// Top countries to show first
const popularCountries = ["US", "KR", "CN", "GB", "CH", "IN", "FR", "DE"];

// Comprehensive list of countries with their calling codes
const countries = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "CH", name: "Switzerland", dialCode: "+41" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "AT", name: "Austria", dialCode: "+43" },
  { code: "BE", name: "Belgium", dialCode: "+32" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "NO", name: "Norway", dialCode: "+47" },
  { code: "DK", name: "Denmark", dialCode: "+45" },
  { code: "FI", name: "Finland", dialCode: "+358" },
  { code: "PL", name: "Poland", dialCode: "+48" },
  { code: "PT", name: "Portugal", dialCode: "+351" },
  { code: "GR", name: "Greece", dialCode: "+30" },
  { code: "CZ", name: "Czech Republic", dialCode: "+420" },
  { code: "HU", name: "Hungary", dialCode: "+36" },
  { code: "RO", name: "Romania", dialCode: "+40" },
  { code: "IE", name: "Ireland", dialCode: "+353" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "AR", name: "Argentina", dialCode: "+54" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "RU", name: "Russia", dialCode: "+7" },
  { code: "TR", name: "Turkey", dialCode: "+90" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971" },
  { code: "IL", name: "Israel", dialCode: "+972" },
  { code: "EG", name: "Egypt", dialCode: "+20" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "TH", name: "Thailand", dialCode: "+66" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "MY", name: "Malaysia", dialCode: "+60" },
  { code: "PH", name: "Philippines", dialCode: "+63" },
  { code: "ID", name: "Indonesia", dialCode: "+62" },
  { code: "VN", name: "Vietnam", dialCode: "+84" },
];

interface CountryCodeSelectProps {
  value: string;
  onChange: (dialCode: string) => void;
}

export function CountryCodeSelect({ value, onChange }: CountryCodeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Filter countries based on search query
  const filteredCountries = countries.filter((country) => {
    const query = searchQuery.toLowerCase();
    return (
      country.name.toLowerCase().includes(query) ||
      country.dialCode.includes(query) ||
      country.code.toLowerCase().includes(query)
    );
  });

  // Separate popular and other countries
  const popularFiltered = filteredCountries.filter((c) => popularCountries.includes(c.code));
  const otherFiltered = filteredCountries.filter((c) => !popularCountries.includes(c.code));

  // Find selected country
  const selectedCountry = countries.find((c) => c.dialCode === value) || countries[0];

  const handleSelect = (dialCode: string) => {
    onChange(dialCode);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-md text-white hover:bg-zinc-750 transition-colors"
      >
        <span className="font-medium">{selectedCountry.dialCode}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-96 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-zinc-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code..."
                className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Country List */}
          <div className="overflow-y-auto max-h-80">
            {popularFiltered.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-900">
                  Popular
                </div>
                {popularFiltered.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelect(country.dialCode)}
                    className={`w-full px-3 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                      selectedCountry.code === country.code ? "bg-zinc-700" : ""
                    }`}
                  >
                    <span className="text-white">{country.name}</span>
                    <span className="text-zinc-400 text-sm">{country.dialCode}</span>
                  </button>
                ))}
              </>
            )}

            {otherFiltered.length > 0 && (
              <>
                {popularFiltered.length > 0 && (
                  <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-900 border-t border-zinc-700">
                    All Countries
                  </div>
                )}
                {otherFiltered.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelect(country.dialCode)}
                    className={`w-full px-3 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                      selectedCountry.code === country.code ? "bg-zinc-700" : ""
                    }`}
                  >
                    <span className="text-white">{country.name}</span>
                    <span className="text-zinc-400 text-sm">{country.dialCode}</span>
                  </button>
                ))}
              </>
            )}

            {filteredCountries.length === 0 && (
              <div className="px-3 py-4 text-center text-zinc-500 text-sm">
                No countries found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
