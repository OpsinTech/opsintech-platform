import { SparklesIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface SkillBadgeProps {
  skillName: string;
  /** Localized display label; falls back to skillName if omitted */
  label?: string;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

export function SkillBadge({ skillName, label, onRemove, onClick, className }: SkillBadgeProps) {
  if (!skillName) return null;

  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-sm font-medium text-primary",
        onClick && "cursor-pointer hover:bg-primary/15 transition-colors",
        className
      )}
    >
      <SparklesIcon className="size-3.5 shrink-0 text-primary/70" />
      <span>{label ?? skillName}</span>
      {onRemove && (
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-primary/60 hover:bg-primary/20 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="size-3" />
          <span className="sr-only">Remove skill</span>
        </button>
      )}
    </span>
  );
}
