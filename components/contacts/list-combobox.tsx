"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const NO_LIST_VALUE = "__none__";
export const NEW_LIST_VALUE = "__new__";

export interface ContactListOption {
  id: string;
  name: string;
}

interface ListComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  lists: ContactListOption[];
}

export function ListCombobox({ value, onValueChange, lists }: ListComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel =
    value === NEW_LIST_VALUE
      ? "+ New list…"
      : value && value !== NO_LIST_VALUE
      ? (lists.find((l) => l.id === value)?.name ?? "No list")
      : "No list";

  const handleSelect = (selected: string) => {
    onValueChange(selected);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder="Search lists…" />
          <CommandList>
            <CommandEmpty>No list found.</CommandEmpty>
            <div className={lists.length > 6 ? "max-h-52 overflow-y-auto" : undefined}>
              <CommandGroup>
                <CommandItem value="no-list" onSelect={() => handleSelect(NO_LIST_VALUE)}>
                  <Check className={cn("mr-2 h-4 w-4", value === NO_LIST_VALUE || !value ? "opacity-100" : "opacity-0")} />
                  No list
                </CommandItem>
                {lists.map((l) => (
                  <CommandItem key={l.id} value={l.name} onSelect={() => handleSelect(l.id)}>
                    <Check className={cn("mr-2 h-4 w-4", value === l.id ? "opacity-100" : "opacity-0")} />
                    {l.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="new-list" onSelect={() => handleSelect(NEW_LIST_VALUE)}>
                <Check className={cn("mr-2 h-4 w-4", value === NEW_LIST_VALUE ? "opacity-100" : "opacity-0")} />
                + New list…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
