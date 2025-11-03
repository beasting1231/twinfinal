import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useBookingSources } from "../hooks/useBookingSources";

interface BookingSourceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  id?: string;
}

export function BookingSourceAutocomplete({
  value,
  onChange,
  required = false,
  label = "Booking Source",
  id = "bookingSource",
}: BookingSourceAutocompleteProps) {
  const { bookingSources } = useBookingSources();
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSources, setFilteredSources] = useState(bookingSources);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update filtered sources when bookingSources changes or value changes
  useEffect(() => {
    if (value.trim() === "") {
      setFilteredSources(bookingSources);
    } else {
      const searchTerm = value.toLowerCase();
      const filtered = bookingSources.filter((source) =>
        source.name.toLowerCase().includes(searchTerm)
      );
      setFilteredSources(filtered);
    }
  }, [value, bookingSources]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleSelectSource = (sourceName: string) => {
    onChange(sourceName);
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor={id} className="text-white">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          required={required}
          className="pr-8"
          placeholder="Type to search or create new..."
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {filteredSources.length > 0 ? (
              <div className="py-1">
                {filteredSources.map((source) => (
                  <button
                    key={source.name}
                    type="button"
                    onClick={() => handleSelectSource(source.name)}
                    className="w-full px-4 py-2 text-left hover:bg-zinc-800 text-white flex items-center justify-between group transition-colors"
                  >
                    <span>{source.name}</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                      {source.count} {source.count === 1 ? "booking" : "bookings"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-zinc-500 text-sm">
                {value.trim() ? (
                  <>
                    No matches found. Press Enter or click outside to create{" "}
                    <span className="text-white font-medium">"{value}"</span>
                  </>
                ) : (
                  "No booking sources yet"
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
