import type { ReportCellValue, ReportColumn, ReportPayload } from "./types";
import {
  buildReportFilename,
  formatGeneratedAt,
  formatDefaultCellValue,
  getFormattedCellValue,
  getReportTotals,
  hasReportTotals,
  saveBlob,
  waitForBrowserFrame,
} from "./utils";

function getExcelValue(value: ReportCellValue, type: ReportColumn<unknown>["type"]) {
  if (value === null || value === undefined) return "";
  if (type === "date") {
    return value instanceof Date ? value : formatDefaultCellValue(value);
  }
  return value;
}

function getExcelNumFmt(type: ReportColumn<unknown>["type"]): string | undefined {
  if (type === "currency") return '"CRC "#,##0.00;[Red]-"CRC "#,##0.00';
  if (type === "number") return '#,##0';
  if (type === "date") return 'dd/mm/yyyy';
  return undefined;
}

export async function exportExcelReport<T>(payload: ReportPayload<T>): Promise<void> {
  await waitForBrowserFrame();

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = payload.systemName;
  workbook.created = payload.generatedAt;
  workbook.modified = payload.generatedAt;

  const worksheet = workbook.addWorksheet(payload.sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const columnCount = payload.columns.length;
  const titleRow = worksheet.addRow([payload.title]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: "FF111827" } };
  titleRow.getCell(1).alignment = { vertical: "middle" };

  worksheet.addRow(["Sistema", payload.systemName]);
  worksheet.addRow(["Generado", formatGeneratedAt(payload.generatedAt)]);
  worksheet.addRow(["Usuario", payload.generatedBy || "No disponible"]);
  worksheet.addRow(["Registros exportados", payload.rows.length]);

  if (payload.filters.length > 0) {
    worksheet.addRow([]);
    worksheet.addRow(["Filtros aplicados"]);
    payload.filters.forEach((filter) => {
      worksheet.addRow([filter.label, filter.value]);
    });
  }

  worksheet.addRow([]);
  const headerRow = worksheet.addRow(payload.columns.map((column) => column.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E3D" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  payload.rows.forEach((row) => {
    const excelRow = worksheet.addRow(
      payload.columns.map((column) => getExcelValue(column.getValue(row), column.type)),
    );

    payload.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      const numFmt = getExcelNumFmt(column.type);
      if (numFmt) cell.numFmt = numFmt;
      cell.alignment = {
        horizontal: column.align ?? (column.type === "currency" ? "right" : "left"),
        vertical: "middle",
        wrapText: column.type === "text",
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  if (hasReportTotals(payload)) {
    const totals = getReportTotals(payload);
    const totalsRow = worksheet.addRow(
      payload.columns.map((column, index) => {
        if (index === 0) return "Totales";
        return column.total === "sum" ? totals[index] ?? 0 : "";
      }),
    );

    totalsRow.eachCell((cell, columnNumber) => {
      const column = payload.columns[columnNumber - 1];
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
      const numFmt = getExcelNumFmt(column.type);
      if (numFmt) cell.numFmt = numFmt;
      cell.alignment = {
        horizontal: column.align ?? (column.type === "currency" ? "right" : "left"),
      };
    });
  }

  const headerRowNumber = headerRow.number;
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columnCount },
  };
  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

  payload.columns.forEach((column, index) => {
    const formattedValues = payload.rows.map((row) =>
      getFormattedCellValue(column, row),
    );
    const maxLength = Math.max(
      column.header.length,
      ...formattedValues.map((value) => value.length),
    );
    worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, 12), 42);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildReportFilename(payload.fileBaseName, "xlsx", payload.generatedAt),
  );
}
