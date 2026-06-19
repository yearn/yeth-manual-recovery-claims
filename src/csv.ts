import { stringify } from "csv-stringify/sync";

export interface CsvColumn {
  key: string;
  header: string;
}

export function writeCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  return stringify(rows, {
    header: true,
    columns: columns.map((column) => ({ key: column.key, header: column.header })),
    cast: {
      string: sanitizeCsvCell,
      bigint: (value) => value.toString(),
      number: (value) => value.toString(),
      boolean: (value) => (value ? "true" : "false"),
      date: (value) => value.toISOString()
    }
  });
}

function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }

  return value;
}
