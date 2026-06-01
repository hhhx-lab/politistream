import { JSDOM } from "jsdom";
import { ExtractedTable } from "../types";

export function extractTablesFromHtml(html: string): ExtractedTable[] {
  const dom = new JSDOM(html);
  const tables: ExtractedTable[] = [];

  for (const table of Array.from(dom.window.document.querySelectorAll("table"))) {
    const caption = clean(table.querySelector("caption")?.textContent ?? "");
    const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) => clean(cell.textContent ?? "")),
    ).filter((row) => row.some(Boolean));

    if (rows.length === 0) continue;
    const firstRow = rows[0] ?? [];
    const hasHeaderCells = table.querySelector("tr th") !== null;
    const headers = hasHeaderCells ? firstRow : firstRow.map((_, index) => `列 ${index + 1}`);
    const bodyRows = hasHeaderCells ? rows.slice(1) : rows;

    tables.push({
      caption: caption || undefined,
      headers,
      rows: bodyRows,
    });
  }

  return tables;
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
