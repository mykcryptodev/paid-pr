"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RepoComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  isLoading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
};

/**
 * Accessible repository combobox. Replaces the native <datalist>, whose
 * dynamically-updated options are unreliable in React-controlled inputs
 * (the popup flickers/closes mid-keystroke and selection is dropped).
 */
export function RepoCombobox({
  value,
  onChange,
  options,
  isLoading = false,
  placeholder = "owner/repo",
  emptyMessage = "No matching repositories.",
}: RepoComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function commit(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      const selected = options[activeIndex];
      if (selected) {
        commit(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          // Results refresh as the user types, so drop any stale highlight.
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-2.5 py-1.5 text-muted-foreground">
              {isLoading ? "Searching repositories..." : emptyMessage}
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1.5",
                  index === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                  option === value && "font-medium",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                // onMouseDown (not onClick) fires before the input blur, so the
                // selection isn't lost to the outside-click handler.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
