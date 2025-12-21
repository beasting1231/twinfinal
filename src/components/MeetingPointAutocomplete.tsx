import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface MeetingPointAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  id?: string;
}

// Predefined meeting points - always shown at the top
const PREDEFINED_MEETING_POINTS = [
  { value: "HW", description: "Meet at our base near the landing field in the centre" },
  { value: "OST", description: "Train Station Interlaken Ost (Outside BIG coop supermarket)" },
  { value: "mhof", description: "Mattenhof Resort (Free Parking)" },
];

// Helper function to convert old full descriptions to abbreviations
export function getMeetingPointAbbreviation(value: string | undefined | null): string {
  if (!value) return "";

  // Check if it's already an abbreviation
  const matchByValue = PREDEFINED_MEETING_POINTS.find(
    (mp) => mp.value.toLowerCase() === value.toLowerCase()
  );
  if (matchByValue) return matchByValue.value;

  // Check if it matches a full description (for backward compatibility with old data)
  const matchByDescription = PREDEFINED_MEETING_POINTS.find(
    (mp) => mp.description.toLowerCase() === value.toLowerCase()
  );
  if (matchByDescription) return matchByDescription.value;

  // Return as-is for custom values
  return value;
}

export function MeetingPointAutocomplete({
  value,
  onChange,
  required = false,
  label = "Meeting Point",
  id = "meetingPoint",
}: MeetingPointAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSearchQuery(newValue);
    setIsOpen(true);
  };

  const handleSelectMeetingPoint = (meetingPointValue: string) => {
    onChange(meetingPointValue);
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setSearchQuery("");
    setIsOpen(true);
  };

  const handleDropdownToggle = () => {
    if (!isOpen) {
      setSearchQuery("");
    }
    setIsOpen(!isOpen);
  };

  // Filter predefined options based on search query
  const filteredPredefined = searchQuery.trim()
    ? PREDEFINED_MEETING_POINTS.filter(
        (mp) =>
          mp.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
          mp.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : PREDEFINED_MEETING_POINTS;

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor={id} className="text-gray-900 dark:text-white">
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
          placeholder="Type to search or enter custom..."
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleDropdownToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
            <div className="py-1">
              {/* Predefined options - always at top */}
              {filteredPredefined.map((mp) => (
                <button
                  key={mp.value}
                  type="button"
                  onClick={() => handleSelectMeetingPoint(mp.value)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white flex flex-col gap-0.5 transition-colors"
                >
                  <span className="font-medium">{mp.value}</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-500">
                    {mp.description}
                  </span>
                </button>
              ))}

              {/* Divider if showing custom value hint */}
              {searchQuery.trim() && !filteredPredefined.some(
                (mp) => mp.value.toLowerCase() === searchQuery.toLowerCase()
              ) && (
                <>
                  {filteredPredefined.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-zinc-700 my-1" />
                  )}
                  <div className="px-4 py-2 text-gray-500 dark:text-zinc-500 text-sm">
                    Press Enter to use{" "}
                    <span className="text-gray-900 dark:text-white font-medium">
                      "{searchQuery}"
                    </span>
                  </div>
                </>
              )}

              {/* Empty state */}
              {filteredPredefined.length === 0 && !searchQuery.trim() && (
                <div className="px-4 py-3 text-gray-500 dark:text-zinc-500 text-sm">
                  No meeting points available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
