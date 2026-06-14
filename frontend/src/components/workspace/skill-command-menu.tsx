"use client";

import { Command } from "cmdk";
import { SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableSkills } from "@/core/skills/hooks";
import type { AvailableSkillResponse } from "@/core/skills/type";
import { cn } from "@/lib/utils";

export interface SkillCommandMenuProps {
  open: boolean;
  search: string;
  position: { top: number; left: number; width: number };
  onOpenChange: (open: boolean) => void;
  onSelect: (skill: AvailableSkillResponse) => void;
  onSearchChange: (search: string) => void;
}

export function SkillCommandMenu({
  open,
  search,
  position,
  onOpenChange,
  onSelect,
  onSearchChange,
}: SkillCommandMenuProps) {
  const { t } = useI18n();
  const { skills, isLoading } = useAvailableSkills();
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    onSearchChange("");
  }, [onOpenChange, onSearchChange]);

  const filteredSkills = useMemo(() => {
    const footerSkillNames = new Set(t.inputBox.suggestions?.map((s) => s.skillName) ?? []);
    const availableSkills = skills.filter(
      (s) => s.enabled !== false && !footerSkillNames.has(s.name)
    );

    if (!search.trim()) {
      return availableSkills;
    }
    const lowerSearch = search.toLowerCase();
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerSearch) ||
        (s.description && s.description.toLowerCase().includes(lowerSearch)),
    );
  }, [skills, search, t.inputBox.suggestions]);

  const groupedSkills = useMemo(() => {
    const groups: Record<string, AvailableSkillResponse[]> = {};
    for (const skill of filteredSkills) {
      const category = skill.category || "default";
      groups[category] ??= [];
      groups[category].push(skill);
    }
    return groups;
  }, [filteredSkills]);

  const handleSelect = useCallback(
    (skill: AvailableSkillResponse) => {
      onSelect(skill);
      onOpenChange(false);
      onSearchChange("");
    },
    [onSelect, onOpenChange, onSearchChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    },
    [handleClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, handleClose]);

  if (!mounted || !open) {
    return null;
  }

  const menuStyle = {
    position: "absolute" as const,
    top: position.top,
    left: position.left,
    width: Math.max(position.width, 280),
    maxHeight: 320,
    zIndex: 50,
  };

  const content = (
    <div
      ref={menuRef}
      className={cn(
        "bg-popover text-popover-foreground rounded-lg border shadow-lg overflow-hidden",
        "animate-in fade-in-0 zoom-in-95 duration-100",
      )}
      style={menuStyle}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-10 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
        <div className="flex items-center gap-2 border-b px-3">
          <SparklesIcon className="size-4 shrink-0 opacity-50 text-primary" />
          <CommandInput
            placeholder={t.inputBox.skillCommandMenuPlaceholder}
            value={search}
            onValueChange={onSearchChange}
            className="flex h-10 flex-1 min-w-0 rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
        <CommandList ref={listRef}>
          <CommandEmpty>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t.inputBox.skillCommandMenuLoading}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t.inputBox.skillCommandMenuNoResults}
              </div>
            )}
          </CommandEmpty>
          {Object.entries(groupedSkills).map(([category, categorySkills]) => (
            <CommandGroup
              key={category}
              heading={
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {category}
                </span>
              }
            >
              {categorySkills.map((skill) => {
                const suggestion = t.inputBox.suggestions?.find(
                  (s) => s.skillName === skill.name
                );
                const displayName = suggestion?.label ?? skill.name;
                const displayDesc = suggestion?.description ?? skill.description;
                return (
                  <CommandItem
                    key={skill.name}
                    value={skill.name}
                    onSelect={() => handleSelect(skill)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col gap-1 pr-2">
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="size-3.5 shrink-0 text-primary" />
                        <span className="font-medium text-sm">{displayName}</span>
                      </div>
                      {displayDesc && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
                          {displayDesc}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}
