import type { ReportPayload } from "./types";
import {
  buildReportFilename,
  escapeCsvValue,
  getFormattedCellValue,
  formatReportTotal,
  getReportTotals,
  hasReportTotals,
  saveBlob,
} from "./utils";

export function exportCsvReport<T>(payload: ReportPayload<T>): void {
  const totals = getReportTotals(payload);
  const lines = [
    payload.columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...payload.rows.map((row) =>
      payload.columns
        .map((column) => escapeCsvValue(getFormattedCellValue(column, row)))
        .join(","),
    ),
  ];

  if (hasReportTotals(payload)) {
    lines.push(
      payload.columns
        .map((column, index) => {
          if (index === 0) return escapeCsvValue("Totales");
          const total = totals[index];
          return escapeCsvValue(formatReportTotal(column, total));
        })
        .join(","),
    );
  }

  const csv = `\uFEFF${lines.join("\r\n")}`;
  saveBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    buildReportFilename(payload.fileBaseName, "csv", payload.generatedAt),
  );
}
