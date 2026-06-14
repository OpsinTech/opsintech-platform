
/**
 * Shared styling mapper for incident/signal severity values.
 * Returns Tailwind/CSS classes for modern HSL colored badges.
 */
export function getSeverityBadgeStyles(severity: string | null | undefined): string {
  if (!severity) {
    return "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400";
  }
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-400";
    case "major":
      return "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-400";
    case "warning":
      return "bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:text-yellow-400";
    case "minor":
      return "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-400";
    default:
      return "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400";
  }
}

/**
 * Standard date formatter for incidents, standardizing locales and year inclusion.
 */
export function formatDate(dateStr: string | null | undefined, includeYear = false): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);

  const options: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };

  if (includeYear) {
    options.year = "numeric";
  }

  return date.toLocaleString("zh-CN", options);
}
