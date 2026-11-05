// 공매재산명세서(엑셀) 읽기 — 온비드 명세서의 칸 구조(시트 2장, 시트마다 칸 위치가 다른 표)를 본뜬 시험 자료를 쓴다.
// 이름은 가상이다. 실제 명세서 파일은 저장소에 넣지 않는다.

import { describe, expect, test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { readWorkbookGrids } from "../lib/excelFile";
import { analyzeStatement } from "../lib/statement";
import { readStatementGrids, type ReadClaim, type SheetGrid } from "../lib/statementExcel";
import type { Claim } from "../lib/types";
import { validateClaims } from "../lib/validate";

/** "A"→0, "B"→1 ... 엑셀 열 이름을 칸 번호로. */
const col = (letter: string): number => [...letter].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** 행 번호(1부터)와 {열 이름: 글자}로 시트를 만든다. 비어 있는 칸은 빈 글자. */
function sheet(name: string, lastRow: number, cells: Record<number, Record<string, string>>): SheetGrid {
  const rows = Array.from({ length: lastRow }, () => Array.from({ length: 25 }, () => ""));
  for (const [rowNumber, entries] of Object.entries(cells)) {
    for (const [letter, text] of Object.entries(entries)) rows[Number(rowNumber) - 1][col(letter)] = text;
  }
  return { name, rows };
}

/** 울산 명세서와 같은 구조: 표 하나가 Page 1·Page 2에 걸쳐 있고 칸 위치가 다르다. */
function sampleGrids(overrides: { property?: string } = {}): SheetGrid[] {
  const page1 = sheet("Page 1", 23, {
    2: { A: "압류재산 공매재산 명세서" },
    6: { A: "공매재산의 표시", F: "울산광역시 중구 성안동 867-3 로얄팰리스 104동 제3층 제302호" },
    5: { A: "공매재산의 표시", F: overrides.property ?? "공동주택" },
    14: { A: "점유 관계", C: "성명", D: "계약일자", F: "전입신고일자 (사업자등록 신청일자)", I: "확정일자", K: "보증금", N: "차임" },
    15: { A: "전입세대주", C: "홍길동", D: "미상", F: "2025-01-22", I: "미상" },
    16: { A: "▣ 임차인 배분 요구 및 채권신고 현황" },
    17: { A: "임대차 구분", C: "성명", D: "계약일자", F: "전입신고일자 (사업자등록 신청일자)", I: "확정일자", K: "보증금", M: "차임", Q: "임차부분", T: "배분요구 일자", W: "채권신고 일자" },
    18: { A: "임차인", C: "홍길동", D: "미상", F: "2025-01-22", I: "2025-01-23", K: "120,000,000", M: "0", Q: "미상", T: "2026-10-07", W: "2026-10-07" },
    19: { A: "▣ 배분요구 및 채권신고 현황" },
    20: { A: "번호", B: "권리관계", E: "성명", H: "압류/설정 (등기)일자", J: "법정기일 (납부기한)", P: "설정금액(원)", V: "배분요구 채권액(원)", X: "배분요구일" },
    21: { A: "1", B: "임차인", E: "홍길동", P: "0", V: "120,000,000", X: "2026-10-07" },
    22: { A: "2", B: "근저당권", E: "농소농업협동조합", H: "2024-02-16", P: "58,800,000", V: "47,261,108", X: "2026-10-02" },
  });
  const page2 = sheet("Page 2", 14, {
    2: { A: "3", B: "교부청구", C: "국민건강보험공단 울산중부지사", E: "2026-02-10 ~ 2026-09-10", F: "0", G: "2,978,400", H: "2026-09-30" },
    3: { A: "4", B: "교부청구", C: "울산북구청", E: "2025-12-10 ~ 2026-08-01", F: "0", G: "2,895,510", H: "2026-08-31" },
    4: { A: "5", B: "물건지지방자치단체", C: "울산중구청", E: "2025-05-14 ~ 2026-07-10", F: "0", G: "909,160", H: "2026-08-25" },
    5: { A: "6", B: "위임기관", C: "동울산세무서", D: "2026-05-26", E: "2025-05-31 ~ 2026-05-31", F: "0", G: "46,318,260", H: "2026-08-24" },
    6: { A: "* 채권신고 및 배분요구현황은 배분요구서를 기준으로 작성하였으며 신고된 채권액은 변동될 수 있습니다." },
    12: { A: "- 미납 관리비, 공과금 등에 대해서는 사전조사 후 입찰바람" },
  });
  return [page1, page2];
}

const find = (claims: ReadClaim[], creditor: string) => claims.find((claim) => claim.values.creditor === creditor)!;

describe("명세서 엑셀 읽기", () => {
  test("두 시트에 걸친 표에서 권리 6건을 읽고 원본 위치를 남긴다", () => {
    const read = readStatementGrids(sampleGrids(), { region: "metro" });
    expect(read.warnings).toEqual([]);
    expect(read.claims.map((c) => [c.kind, c.values.creditor, c.source])).toEqual([
      ["lease", "홍길동", "Page 1 18행"],
      ["mortgage", "농소농업협동조합", "Page 1 22행"],
      ["publicCharge", "국민건강보험공단 울산중부지사", "Page 2 2행"],
      ["tax", "울산북구청", "Page 2 3행"],
      ["tax", "울산중구청", "Page 2 4행"],
      ["tax", "동울산세무서", "Page 2 5행"],
    ]);
    expect(read.addressText).toContain("울산광역시 중구");
    expect(read.isHousing).toBe(true);
  });

  test("임차인: 임차인 표의 전입일·확정일자·보증금을 읽고 소재지 구분은 사용자가 고른 값", () => {
    const read = readStatementGrids(sampleGrids(), { region: "metro" });
    expect(find(read.claims, "홍길동").values).toMatchObject({
      amount: "120000000", moveInDate: "2025-01-22", fixedDate: "2025-01-23", isHousing: "yes", region: "metro", requestedDistribution: "yes",
    });
    // 소재지를 고르지 않으면 빈칸 (주소로 추측하지 않는다)
    expect(find(readStatementGrids(sampleGrids()).claims, "홍길동").values.region).toBe("");
  });

  test("근저당권: 채권액은 설정금액이 아니라 배분요구 채권액, 날짜는 설정일", () => {
    const mortgage = find(readStatementGrids(sampleGrids()).claims, "농소농업협동조합");
    expect(mortgage.values).toMatchObject({ amount: "47261108", registrationDate: "2024-02-16", requestedDistribution: "yes" });
  });

  test("기간으로 적힌 법정기일은 시작일자를 쓴다", () => {
    const claims = readStatementGrids(sampleGrids()).claims;
    expect(find(claims, "국민건강보험공단 울산중부지사").values).toMatchObject({ dueDate: "2026-02-10", amount: "2978400" });
    expect(find(claims, "울산북구청").taxItems[0].legalDueDate).toBe("2025-12-10");
    expect(find(claims, "울산중구청").taxItems[0].legalDueDate).toBe("2025-05-14");
  });

  test("교부청구·물건지 지방자치단체는 당해세가 아니고(표기 없음), 위임기관은 압류한 국세", () => {
    const claims = readStatementGrids(sampleGrids()).claims;
    const district = find(claims, "울산중구청");
    expect(district.values).toMatchObject({ taxType: "local", seizureDate: "", hasTaxCollateral: "no" });
    expect(district.taxItems[0].isDangHaeSe).toBe("no");
    const office = find(claims, "동울산세무서");
    expect(office.values).toMatchObject({ taxType: "national", seizureDate: "2026-05-26", amount: "46318260" });
    expect(office.taxItems[0].legalDueDate).toBe("2025-05-31");
  });

  test("재산 표시가 상가이면 주택이 아님으로 읽고 차임을 받는다", () => {
    const read = readStatementGrids(sampleGrids({ property: "상가" }));
    expect(read.isHousing).toBe(false);
    expect(find(read.claims, "홍길동").values).toMatchObject({ isHousing: "no", monthlyRent: "0" });
    // 사용자가 고른 주택 여부가 재산 표시보다 우선한다
    expect(find(readStatementGrids(sampleGrids({ property: "상가" }), { isHousing: true }).claims, "홍길동").values.isHousing).toBe("yes");
  });

  test("읽지 못한 값은 추측하지 않고 빈칸 + 경고: 확정일자 미상, 분류 못 한 권리, 채권액 없음", () => {
    const grids = sampleGrids();
    grids[0].rows[17][col("I")] = "미상"; // 임차인 확정일자
    grids[1].rows[1][col("B")] = "특수권리"; // 권리관계를 알 수 없음
    grids[1].rows[2][col("G")] = "미정"; // 채권액이 금액이 아님
    const read = readStatementGrids(grids);
    expect(find(read.claims, "홍길동").values.fixedDate).toBe("");
    expect(read.claims.some((c) => c.values.creditor === "국민건강보험공단 울산중부지사")).toBe(false);
    expect(read.claims.some((c) => c.values.creditor === "울산북구청")).toBe(false);
    expect(read.warnings.some((w) => w.includes("Page 2 2행") && w.includes("권리 종류"))).toBe(true);
    expect(read.warnings.some((w) => w.includes("Page 2 3행") && w.includes("채권액"))).toBe(true);
  });

  test("배분요구일이 없으면 설정일을 배분요구일로 착각하지 않는다 (날짜 순서로 구분)", () => {
    const grids = sampleGrids();
    grids[0].rows[21][col("X")] = ""; // 근저당권의 배분요구일 삭제
    const mortgage = find(readStatementGrids(grids).claims, "농소농업협동조합");
    expect(mortgage.values).toMatchObject({ registrationDate: "2024-02-16", requestedDistribution: "" });
  });

  test("압류권자가 압류일과 법정기일을 모두 적은 경우(두 날짜)와 법정기일 없는 압류는 경고", () => {
    const grids = sampleGrids();
    grids[1].rows[1] = grids[1].rows[1].map(() => "");
    Object.assign(grids[1].rows[1], { [col("A")]: "3", [col("B")]: "압류", [col("C")]: "관악세무서", [col("D")]: "2018-03-01", [col("E")]: "2017-10-06", [col("F")]: "0", [col("G")]: "30,000,000" });
    grids[1].rows[2] = grids[1].rows[2].map(() => "");
    Object.assign(grids[1].rows[2], { [col("A")]: "4", [col("B")]: "압류", [col("C")]: "용산세무서", [col("D")]: "2011-07-12", [col("F")]: "0", [col("G")]: "500,000" });
    const read = readStatementGrids(grids);
    expect(find(read.claims, "관악세무서").values).toMatchObject({ seizureDate: "2018-03-01", taxType: "national" });
    expect(find(read.claims, "관악세무서").taxItems[0].legalDueDate).toBe("2017-10-06");
    expect(find(read.claims, "용산세무서").taxItems[0].legalDueDate).toBe("");
    expect(read.warnings.some((w) => w.includes("Page 2 3행") && w.includes("법정기일"))).toBe(true);
  });

  test("엑셀이 아닌 내용이면 읽을 권리가 없다는 경고", () => {
    const read = readStatementGrids([{ name: "Sheet1", rows: [["안녕하세요"]] }]);
    expect(read.claims).toEqual([]);
    expect(read.warnings[0]).toContain("읽을 수 있는 권리를 찾지 못했습니다");
  });
});

describe("읽은 값으로 권리 순위 분석 (울산 명세서 구조)", () => {
  test("읽은 값을 확인 표 → 입력값 검사 → 분석에 넣으면 담당자 정답 순서가 나온다 (울산은 광역시)", () => {
    const read = readStatementGrids(sampleGrids(), { region: "metro" });
    const claims: Claim[] = read.claims.map((item, index) => {
      const built = buildClaim(`read-${index}`, item.kind, item.values, item.taxItems, false).claim;
      return { ...built, source: item.source };
    });
    expect(validateClaims(claims).canCalculate).toBe(true);

    const analysis = analyzeStatement(claims);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.rows.map((row) => [row.stage, row.label])).toEqual([
      ["1순위", "근저당권(농소농업협동조합)"],
      ["2순위", "주택임차보증금(홍○○)"],
      ["3순위", "조세(동울산세무서) (세목 미기재)"],
      ["4순위", "조세(울산북구청) (세목 미기재)"],
      ["4순위", "조세(울산중구청) (세목 미기재)"],
      ["5순위", "공과금(국민건강보험공단 울산중부지사)"],
    ]);
    // 보증금 1.2억은 광역시 소액 기준(8,500만원 이하)을 넘으므로 먼저 배분 단계(소액임차)가 없다
    expect(analysis.rows.some((row) => row.stage === "먼저 배분")).toBe(false);
    expect(analysis.acquiringTenants).toEqual([{ label: "주택임차보증금(홍○○)", deposit: 120_000_000 }]);
  });
});

describe("엑셀 파일 → 칸 글자", () => {
  test(".xls 파일을 시트별 칸 글자로 바꾼다 (날짜 칸은 YYYY-MM-DD)", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["번호", "  권리  관계 "], ["1", "근저당권", new Date(Date.UTC(2024, 1, 16))]]), "Page 1");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["120,000,000", "미상"]]), "Page 2");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "biff8" }) as ArrayBuffer;

    const grids = await readWorkbookGrids(bytes);
    expect(grids.map((grid) => grid.name)).toEqual(["Page 1", "Page 2"]);
    expect(grids[0].rows[0].slice(0, 2)).toEqual(["번호", "권리 관계"]); // 공백 정리
    expect(grids[0].rows[1][0]).toBe("1");
    expect(grids[0].rows[1][2]).toMatch(/^2024-02-1[56]$/); // 날짜는 yyyy-mm-dd 글자
    expect(grids[1].rows[0]).toEqual(["120,000,000", "미상"]);
  });
});
