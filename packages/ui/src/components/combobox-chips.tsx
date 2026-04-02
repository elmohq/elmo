"use client";

import * as React from "react";
import { Check, ChevronDown, X as RemoveIcon } from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";

type ComboboxOption = {
  value: string;
  label?: string;
};

export interface ComboboxChipsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string[];
  onValueChange: (next: string[]) => void;
  options?: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustomValues?: boolean;
  /** Split pasted text into multiple values, like `TagsInput` */
  allowPasteSplit?: boolean;
  /**
   * Optional hook to normalize user-entered values (typing, paste, create).
   * Use this for things like domain normalization.
   */
  normalizeValue?: (raw: string) => string;
  maxItems?: number;
  minItems?: number;
  disabled?: boolean;
}

const SPLITTER_REGEX = /[\n#?=&\t,./-]+/;
const FORMATTING_REGEX = /^[^a-zA-Z0-9]*|[^a-zA-Z0-9]*$/g;

export function ComboboxChips({
  value,
  onValueChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results.",
  allowCustomValues = true,
  allowPasteSplit = true,
  normalizeValue,
  maxItems,
  minItems = 0,
  disabled,
  className,
  ...props
}: ComboboxChipsProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const max = maxItems ?? Number.POSITIVE_INFINITY;
  const canAddMore = !disabled && value.length < max;
  const canRemove = !disabled && value.length > minItems;

  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.label ?? o.value).toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  const normalizedCandidate = React.useMemo(() => (normalizeValue ? normalizeValue(query) : query.trim()), [normalizeValue, query]);
  const candidateExists =
    normalizedCandidate.length > 0 &&
    (selectedSet.has(normalizedCandidate) || options.some((o) => o.value === normalizedCandidate));

  const canCreate = allowCustomValues && canAddMore && normalizedCandidate.length > 0 && !candidateExists;

  const addValue = React.useCallback(
    (nextVal: string) => {
      if (!nextVal) return;
      if (selectedSet.has(nextVal)) return;
      if (value.length >= max) return;
      onValueChange([...value, nextVal]);
    },
    [max, onValueChange, selectedSet, value],
  );

  const addMany = React.useCallback(
    (rawValues: string[]) => {
      if (!rawValues.length) return;
      if (!canAddMore) return;

      const next = [...value];
      for (const raw of rawValues) {
        if (next.length >= max) break;
        const base = normalizeValue ? normalizeValue(raw) : raw.trim();
        const parsed = base.replaceAll(FORMATTING_REGEX, "").trim();
        if (!parsed) continue;
        if (next.includes(parsed)) continue;
        next.push(parsed);
      }
      if (next.length !== value.length) onValueChange(next);
    },
    [canAddMore, max, normalizeValue, onValueChange, value],
  );

  const toggleValue = React.useCallback(
    (nextVal: string) => {
      if (selectedSet.has(nextVal)) {
        if (!canRemove) return;
        onValueChange(value.filter((v) => v !== nextVal));
      } else {
        if (!canAddMore) return;
        addValue(nextVal);
      }
    },
    [addValue, canAddMore, canRemove, onValueChange, selectedSet, value],
  );

  const removeValue = React.useCallback(
    (nextVal: string) => {
      if (!canRemove) return;
      if (!selectedSet.has(nextVal)) return;
      onValueChange(value.filter((v) => v !== nextVal));
    },
    [canRemove, onValueChange, selectedSet, value],
  );

  const onOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (disabled) return;
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    },
    [disabled],
  );

  return (
    <div {...props} className={cn("flex w-full flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            className={cn(
              "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
              "cursor-pointer",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                value.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1">
                    <span className="max-w-[14rem] truncate">{v}</span>
                    <span className="sr-only">Remove {v}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      disabled={!canRemove}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeValue(v);
                      }}
                    >
                      <RemoveIcon className="size-3" />
                    </Button>
                  </Badge>
                ))
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command
            shouldFilter={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                addValue(normalizedCandidate);
                setQuery("");
              }
            }}
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={canAddMore ? searchPlaceholder : "Maximum reached"}
              disabled={!canAddMore}
              onPaste={(e) => {
                if (!allowPasteSplit) return;
                if (!canAddMore) return;
                e.preventDefault();
                const text = e.clipboardData.getData("text");
                const parts = text.split(SPLITTER_REGEX);
                addMany(parts);
                setQuery("");
                setOpen(false);
              }}
            />
            <CommandList>
              {query.trim().length > 0 && !canCreate && filteredOptions.length === 0 && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              {(canCreate || filteredOptions.length > 0) && (
                <CommandGroup>
                  {canCreate && (
                    <CommandItem
                      value={`__create__:${normalizedCandidate}`}
                      onSelect={() => {
                        addValue(normalizedCandidate);
                        setQuery("");
                      }}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate">
                          Create <span className="font-medium">{normalizedCandidate}</span>
                        </span>
                      </span>
                    </CommandItem>
                  )}
                  {filteredOptions.map((opt) => {
                    const isSelected = selectedSet.has(opt.value);
                    return (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => {
                          toggleValue(opt.value);
                        }}
                      >
                        <Check className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{opt.label ?? opt.value}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

