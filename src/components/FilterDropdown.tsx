import { useState, useMemo } from "react";
import { Check, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

interface FilterDropdownProps {
  title: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  trigger: React.ReactNode;
}

export function FilterDropdown({
  title,
  options,
  selectedValues,
  onChange,
  trigger,
}: FilterDropdownProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter((option) =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  const toggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter((v) => v !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const selectAll = () => {
    onChange(options);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-zinc-900 border-zinc-700" align="start">
        <div className="flex flex-col max-h-96">
          {/* Header */}
          <div className="px-3 py-2 border-b border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">{title}</span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 bg-zinc-800 border-zinc-700 text-white text-sm"
            />
          </div>

          {/* Options */}
          <div className="flex-1 overflow-y-auto py-2">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">No options found</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => toggleOption(option)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 text-left"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected
                          ? "bg-white border-white"
                          : "border-zinc-600 bg-zinc-900"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-black" />}
                    </div>
                    <span className="text-sm text-white">{option}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-zinc-800 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="flex-1 h-8 text-xs border-zinc-700 text-white hover:bg-zinc-800"
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="flex-1 h-8 text-xs border-zinc-700 text-white hover:bg-zinc-800"
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
