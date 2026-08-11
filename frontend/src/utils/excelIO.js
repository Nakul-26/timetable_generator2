import * as XLSX from "xlsx";

export function getCellValue(row, keys) {
  for (const key of keys) {
    const raw = row[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      return String(raw).trim();
    }
  }
  return "";
}

export function downloadTemplate(headerRow, sampleRow, sheetName, fileName) {
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, sampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export function exportRows(rows, sheetName, fileName) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export async function readWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) {
    throw new Error("No sheet found in the uploaded file.");
  }

  const sheet = workbook.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error("The uploaded sheet is empty.");
  }
  return rawRows;
}

export function findDuplicateIds(rows, idKey = "id") {
  const duplicateIds = new Set();
  const seenIds = new Set();
  rows.forEach((row) => {
    const key = String(row[idKey]).toLowerCase();
    if (seenIds.has(key)) duplicateIds.add(row[idKey]);
    seenIds.add(key);
  });
  return Array.from(duplicateIds);
}
