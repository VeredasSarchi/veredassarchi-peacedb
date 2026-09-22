const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const match = CALENDAR_DATE_PATTERN.exec(trimmed);
  if (match) {
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(year, month - 1, day);

    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return parsed;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCalendarDate(
  value: string | null | undefined,
  fallback = "Sin fecha",
): string {
  if (!value) return fallback;
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("es-CR");
}

export function toLocalCalendarDateValue(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}
