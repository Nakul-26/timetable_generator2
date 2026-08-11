import { useCallback, useRef, useState } from "react";
import { readWorkbookRows, findDuplicateIds } from "../utils/excelIO";

// Shared "upload filled Excel template" flow for CRUD list pages: read the workbook,
// normalize/validate rows, reject duplicate ids, then upsert row-by-row.
//
// - normalizeRow(rawRow) -> normalized row object (may throw for a row-level validation error)
// - isValidRow(normalizedRow) -> boolean, required columns present
// - upsertRow(normalizedRow) -> Promise<boolean>, resolve true if the row updated an existing
//   record, false if it created a new one
// - requiredColumnsHint -> text appended to the "no valid rows" error, e.g. "id, name, sem"
export default function useExcelImport({
  entityLabel,
  idKey = "id",
  normalizeRow,
  isValidRow,
  upsertRow,
  requiredColumnsHint,
  onDone,
}) {
  const [excelMessage, setExcelMessage] = useState("");
  const [excelError, setExcelError] = useState("");
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const fileInputRef = useRef(null);

  const clearExcelStatus = useCallback(() => {
    setExcelMessage("");
    setExcelError("");
  }, []);

  const triggerExcelUpload = useCallback(() => {
    clearExcelStatus();
    fileInputRef.current?.click();
  }, [clearExcelStatus]);

  const handleExcelUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearExcelStatus();
    setUploadingExcel(true);

    try {
      const rawRows = await readWorkbookRows(file);
      const normalizedRows = rawRows.map(normalizeRow);
      const validRows = normalizedRows.filter(isValidRow);
      if (validRows.length === 0) {
        throw new Error(
          `No valid rows found.${requiredColumnsHint ? ` Required columns: ${requiredColumnsHint}.` : ""}`
        );
      }

      const duplicateIds = findDuplicateIds(validRows, idKey);
      if (duplicateIds.length > 0) {
        throw new Error(`Duplicate ${entityLabel} IDs in file: ${duplicateIds.join(", ")}`);
      }

      let createdCount = 0;
      let updatedCount = 0;
      for (const row of validRows) {
        const wasUpdate = await upsertRow(row);
        if (wasUpdate) updatedCount += 1;
        else createdCount += 1;
      }

      onDone?.();
      setExcelMessage(`Upload complete. Created: ${createdCount}, Updated: ${updatedCount}.`);
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || `Failed to upload ${entityLabel} from Excel.`;
      setExcelError(message);
    } finally {
      setUploadingExcel(false);
      if (event.target) event.target.value = "";
    }
  }, [clearExcelStatus, normalizeRow, isValidRow, idKey, entityLabel, upsertRow, requiredColumnsHint, onDone]);

  return {
    excelMessage,
    excelError,
    uploadingExcel,
    fileInputRef,
    clearExcelStatus,
    triggerExcelUpload,
    handleExcelUpload,
    // Exposed so pages can report status for the sibling "download template" /
    // "export" actions through the same message/error UI.
    setExcelMessage,
    setExcelError,
  };
}
