import type { jsPDF as JsPDFDocument } from "jspdf";
import type { ReportPayload } from "./types";
import {
  buildReportFilename,
  formatGeneratedAt,
  formatReportTotal,
  getFormattedCellValue,
  getReportTotals,
  hasReportTotals,
  waitForBrowserFrame,
} from "./utils";

function buildFilterText<T>(payload: ReportPayload<T>): string {
  if (payload.filters.length === 0) return "Filtros aplicados: Sin filtros";
  return `Filtros aplicados: ${payload.filters
    .map((filter) => `${filter.label}: ${filter.value}`)
    .join(" | ")}`;
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/\u20a1/g, "CRC ")
    .replace(/[\u00a0\u202f]/g, " ");
}

function drawHeader<T>(
  doc: JsPDFDocument,
  payload: ReportPayload<T>,
  margin: number,
  pageWidth: number,
  filterLines: string[],
): void {
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(sanitizePdfText(payload.systemName), margin, 28);

  doc.setFontSize(15);
  doc.text(sanitizePdfText(payload.title), margin, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(
    sanitizePdfText(`Generado: ${formatGeneratedAt(payload.generatedAt)}`),
    margin,
    64,
  );
  doc.text(
    sanitizePdfText(`Usuario: ${payload.generatedBy || "No disponible"}`),
    margin,
    76,
  );
  doc.text(
    sanitizePdfText(`Registros exportados: ${payload.rows.length}`),
    pageWidth - margin,
    64,
    {
      align: "right",
    },
  );

  let y = 92;
  filterLines.forEach((line) => {
    doc.text(sanitizePdfText(line), margin, y);
    y += 10;
  });
}

export async function exportPdfReport<T>(payload: ReportPayload<T>): Promise<void> {
  await waitForBrowserFrame();

  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule.autoTable;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
    compress: true,
  });

  doc.setProperties({
    title: payload.title,
    subject: payload.title,
    author: payload.generatedBy || payload.systemName,
    creator: payload.systemName,
  });

  const margin = 28;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const filterLines = doc.splitTextToSize(
    sanitizePdfText(buildFilterText(payload)),
    pageWidth - margin * 2,
  ) as string[];
  const headerHeight = 104 + filterLines.length * 10;
  const totals = getReportTotals(payload);

  autoTable(doc, {
    head: [payload.columns.map((column) => sanitizePdfText(column.header))],
    body: payload.rows.map((row) =>
      payload.columns.map((column) =>
        sanitizePdfText(getFormattedCellValue(column, row)),
      ),
    ),
    foot: hasReportTotals(payload)
      ? [
          payload.columns.map((column, index) => {
            if (index === 0) return "Totales";
            return sanitizePdfText(formatReportTotal(column, totals[index]));
          }),
        ]
      : undefined,
    startY: headerHeight,
    margin: { top: headerHeight, right: margin, bottom: 38, left: margin },
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    styles: {
      font: "helvetica",
      fontSize: 6.5,
      cellPadding: 3,
      overflow: "linebreak",
      valign: "middle",
      lineColor: [209, 213, 219],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [31, 78, 61],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: Object.fromEntries(
      payload.columns.map((column, index) => [
        index,
        { halign: column.align ?? (column.type === "currency" ? "right" : "left") },
      ]),
    ),
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    didDrawPage: () => {
      drawHeader(doc, payload, margin, pageWidth, filterLines);
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text(
      sanitizePdfText(`${payload.rows.length} registros exportados`),
      margin,
      pageHeight - 18,
    );
    doc.text(
      sanitizePdfText(`Pagina ${page} de ${totalPages}`),
      pageWidth - margin,
      pageHeight - 18,
      {
        align: "right",
      },
    );
  }

  doc.save(buildReportFilename(payload.fileBaseName, "pdf", payload.generatedAt));
}
