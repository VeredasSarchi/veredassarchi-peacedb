import type { ReportCellValue, ReportColumn, ReportPayload } from "./types";

export function formatReportTimestamp(value: Date): string {
  const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getDate()).padStart(2, "0")}`;
  const time = `${String(value.getHours()).padStart(2, "0")}${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;

  return `${date}_${time}`;
}

export function buildReportFilename(
  fileBaseName: string,
  extension: "csv" | "xlsx" | "pdf",
  generatedAt: Date,
): string {
  return `${fileBaseName}_${formatReportTimestamp(generatedAt)}.${extension}`;
}

export function formatGeneratedAt(value: Date): string {
  return value.toLocaleString("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDefaultCellValue(value: ReportCellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("es-CR");
  return String(value);
}

export function getFormattedCellValue<T>(
  column: ReportColumn<T>,
  row: T,
): string {
  const value = column.getValue(row);
  return column.formatValue
    ? column.formatValue(value, row)
    : formatDefaultCellValue(value);
}

export function getNumericCellValue<T>(
  column: ReportColumn<T>,
  row: T,
): number {
  const value = column.getValue(row);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getReportTotals<T>(payload: ReportPayload<T>): Array<number | null> {
  return payload.columns.map((column) => {
    if (column.total !== "sum") return null;
    return payload.rows.reduce(
      (sum, row) => sum + getNumericCellValue(column, row),
      0,
    );
  });
}

export function formatReportTotal<T>(
  column: ReportColumn<T>,
  value: number | null,
): string {
  if (value === null) return "";
  if (column.type === "currency") {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("es-CR", {
    maximumFractionDigits: column.type === "number" ? 0 : 2,
  }).format(value);
}

export function hasReportTotals<T>(payload: ReportPayload<T>): boolean {
  return payload.columns.some((column) => column.total === "sum");
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function escapeCsvValue(value: ReportCellValue): string {
  const text = formatDefaultCellValue(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function waitForBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
