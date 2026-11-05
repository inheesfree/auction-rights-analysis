// 엑셀 파일(.xls, .xlsx)을 시트별 칸 글자로 바꾼다.
// 사용자 브라우저 안에서만 읽고 서버로 보내지 않는다 (PRD: 업로드한 파일을 서버에 저장하지 않는다).
// SheetJS 공식 배포본(0.20.3)을 쓰며, 파일을 처음 읽을 때에만 불러와서 첫 화면이 무거워지지 않게 한다.

import type { SheetGrid } from "./statementExcel";

/** 읽어도 되는 파일 크기의 상한 (5MB). 명세서는 보통 수십 KB다. */
export const MAX_EXCEL_BYTES = 5 * 1024 * 1024;

/** 엑셀 파일 내용을 시트별 칸 글자로 바꾼다. 날짜 칸은 `YYYY-MM-DD` 글자로 바꾼다. */
export async function readWorkbookGrids(data: ArrayBuffer): Promise<SheetGrid[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(data, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils
      .sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd" })
      .map((row) => row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim())),
  }));
}
