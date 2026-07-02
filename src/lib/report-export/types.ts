export type ReportCellValue = string | number | Date | null | undefined;

export type ReportColumn<T> = {
  id: string;
  header: string;
  getValue: (row: T) => ReportCellValue;
  formatValue?: (value: ReportCellValue, row: T) => string;
  type?: "text" | "number" | "currency" | "date";
  align?: "left" | "center" | "right";
  total?: "sum";
};

export type ReportFilter = {
  label: string;
  value: string;
};

export type ReportPayload<T> = {
  systemName: string;
  title: string;
  sheetName: string;
  fileBaseName: string;
  generatedAt: Date;
  generatedBy?: string | null;
  filters: ReportFilter[];
  columns: ReportColumn<T>[];
  rows: T[];
};

