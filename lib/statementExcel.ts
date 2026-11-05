// Design Ref: PRD 흐름 C — 공매재산명세서(엑셀)에서 권리 값을 읽는다
// Plan SC: 작업 17·19 일부 — 읽은 값은 원본 위치와 함께 확인 표로 보내고, 읽지 못한 값은 추측하지 않고 빈칸으로 둔다
//
// 담당자 확인 (2026-11-05)
//   - 법정기일이 기간(예: 2026-02-10 ~ 2026-09-10)이면 시작일자를 쓴다.
//   - 당해세는 명세서에 별도 표기가 없으면 당해세가 아니다. (납세담보도 표기가 없어 "없음"으로 읽는다)
//   - 채권액은 "배분요구 채권액"이다 (설정금액이 아니다).
//   - 권리 분류: 임차인 → 임차보증금, 근저당권 → 근저당, 교부청구·물건지 지방자치단체는 기관 이름으로
//     (건강보험·국민연금·근로복지 → 공과금, 세무서 → 국세, 시·구·군청 → 지방세), 위임기관 → 압류한 조세.
//   - 소재지 구분과 주택 여부는 사용자가 고른다(주소로 자동 판단하지 않는다). 주택 여부는 재산 표시로 짐작해 미리 채운다.
//
// 이 파일은 엑셀 라이브러리를 쓰지 않는다. 시트의 칸 글자(`SheetGrid`)만 받아서 읽는다 (lib/excelFile.ts가 엑셀 파일을 칸 글자로 바꾼다).
// 같은 표가 시트마다 칸 위치가 달라서(Page 1은 H·J·P·V열, Page 2는 D·E·F·G열) 칸 위치가 아니라 값의 모양(날짜, 기간, 금액)과 순서로 읽는다.

import type { FormValues } from "./claimForm";
import { parseDate } from "./dates";
import type { LeaseRegion, RightKind } from "./types";

/** 시트 한 장의 칸 글자. `rows[행][열]`이고 앞뒤 공백을 정리한 글자다. */
export interface SheetGrid {
  name: string;
  rows: string[][];
}

/** 엑셀에서 읽은 권리 한 건. `values`·`taxItems`는 입력 화면의 칸과 같은 모양이다. */
export interface ReadClaim {
  /** 원본 위치. 예: "Page 2 3행" */
  source: string;
  kind: RightKind;
  values: FormValues;
  taxItems: FormValues[];
}

export interface StatementRead {
  claims: ReadClaim[];
  /** 읽지 못했거나 확인이 필요한 곳. */
  warnings: string[];
  /** 공매재산의 주소. 소재지 구분을 고를 때 참고하라고 보여준다. */
  addressText: string | null;
  /** 재산 표시로 짐작한 주택 여부. 알 수 없으면 `null`. */
  isHousing: boolean | null;
}

export interface ReadOptions {
  /** 사용자가 고른 소재지 구분. 비어 있으면 임차인의 소재지 구분은 빈칸이다. */
  region?: LeaseRegion | "";
  /** 사용자가 고른 주택 여부. 비어 있으면 재산 표시로 짐작한 값을 쓴다. */
  isHousing?: boolean | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_PATTERN = /^(.+?)\s*~\s*(.+)$/;
const AMOUNT_PATTERN = /^\d{1,3}(,\d{3})*$|^\d+$/;

/** 칸 글자를 정리한다 (공백 줄임). */
function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** 날짜 글자를 `YYYY-MM-DD`로. 날짜가 아니면(예: "미상") 빈 글자. */
function toDate(text: string): string {
  return parseDate(text) ?? "";
}

/** 금액 글자(쉼표 포함)를 숫자만 남긴 글자로. 금액이 아니면 빈 글자. */
function toAmount(text: string): string {
  const cleaned = clean(text);
  return AMOUNT_PATTERN.test(cleaned) ? cleaned.replace(/,/g, "") : "";
}

type Token =
  | { type: "date"; text: string; value: string }
  | { type: "range"; text: string; start: string }
  | { type: "amount"; text: string; value: string }
  | { type: "other"; text: string };

function tokenize(text: string): Token {
  const range = RANGE_PATTERN.exec(text);
  if (range) {
    const start = toDate(range[1]);
    if (start) return { type: "range", text, start };
  }
  if (DATE_PATTERN.test(text) || /^\d{4}[./]\d{1,2}[./]\d{1,2}\.?$/.test(text)) {
    const value = toDate(text);
    if (value) return { type: "date", text, value };
  }
  if (AMOUNT_PATTERN.test(text)) return { type: "amount", text, value: text.replace(/,/g, "") };
  return { type: "other", text };
}

// ---------------------------------------------------------------------------
// 권리 분류
// ---------------------------------------------------------------------------

type TaxKind = "national" | "local";
type Classified =
  | { kind: "mortgage" | "jeonse" | "provisionalSeizure" | "securityProvisionalRegistration" }
  | { kind: "publicCharge" }
  | { kind: "tax"; taxType: TaxKind }
  | null;

const PUBLIC_CHARGE_WORDS = ["건강보험", "국민연금", "근로복지", "고용보험", "산재", "공단"];
const NATIONAL_TAX_WORDS = ["세무서", "국세", "세관"];
const LOCAL_TAX_WORDS = ["시청", "구청", "군청", "도청", "특별시", "광역시", "지방자치단체"];

/** 기관 이름으로 공과금·국세·지방세를 가른다. 가르지 못하면 `null`. */
function classifyAgency(name: string): Classified {
  if (PUBLIC_CHARGE_WORDS.some((word) => name.includes(word))) return { kind: "publicCharge" };
  if (NATIONAL_TAX_WORDS.some((word) => name.includes(word))) return { kind: "tax", taxType: "national" };
  if (LOCAL_TAX_WORDS.some((word) => name.includes(word)) || /[시군구]$/.test(name)) return { kind: "tax", taxType: "local" };
  return null;
}

/** 권리관계와 기관 이름으로 권리 종류를 정한다. */
function classify(relation: string, name: string): Classified {
  if (relation.includes("근저당") || relation.includes("저당")) return { kind: "mortgage" };
  if (relation.includes("전세권")) return { kind: "jeonse" };
  if (relation.includes("가압류")) return { kind: "provisionalSeizure" };
  if (relation.includes("가등기")) return { kind: "securityProvisionalRegistration" };
  if (relation.includes("교부청구") || relation.includes("물건지") || relation.includes("위임기관") || relation.includes("압류")) {
    return classifyAgency(name);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 재산 표시
// ---------------------------------------------------------------------------

const HOUSING_WORDS = ["공동주택", "아파트", "다세대", "연립", "빌라", "단독주택", "다가구"];
const NON_HOUSING_WORDS = ["상가", "점포", "공장", "근린생활", "사무", "토지", "임야", "대지권 없는"];

function readProperty(grids: readonly SheetGrid[]): { addressText: string | null; isHousing: boolean | null } {
  const texts: string[] = [];
  for (const grid of grids) {
    for (const row of grid.rows) {
      const cells = row.map(clean).filter((cell) => cell !== "");
      if (cells[0] === "공매재산의 표시" && cells[1]) texts.push(cells[1]);
    }
  }
  const addressText = texts.find((text) => /[시도]\s/.test(text) && /[동읍면로길]/.test(text)) ?? null;
  // 건물의 용도는 첫 「공매재산의 표시」 줄에 적힌다(예: 공동주택, 업무시설). 뒤의 줄은 주소와 대지·건물 면적이라
  // "공장용지"처럼 땅의 종류가 적혀 있어도 건물 용도와 무관하므로 보지 않는다.
  const usage = texts[0] ?? "";
  if (HOUSING_WORDS.some((word) => usage.includes(word))) return { addressText, isHousing: true };
  if (NON_HOUSING_WORDS.some((word) => usage.includes(word))) return { addressText, isHousing: false };
  return { addressText, isHousing: null };
}

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------

const where = (grid: SheetGrid, rowIndex: number) => `${grid.name} ${rowIndex + 1}행`;

/** 임차인 표(임대차 구분, 성명, 전입신고일자, 확정일자, 보증금 ...)를 읽는다. */
function readTenants(
  grids: readonly SheetGrid[],
  options: ReadOptions,
  isHousing: boolean | null,
  warnings: string[],
): { claims: ReadClaim[]; tableFound: boolean } {
  const claims: ReadClaim[] = [];
  let tableFound = false;
  for (const grid of grids) {
    const headerIndex = grid.rows.findIndex((row) => row.some((cell) => /^임대차\s*구분/.test(clean(cell))) && row.some((cell) => /^보증금/.test(clean(cell))));
    if (headerIndex === -1) continue;
    tableFound = true;

    const column: Record<string, number> = {};
    grid.rows[headerIndex].forEach((cell, index) => {
      const text = clean(cell);
      if (/^성명/.test(text)) column.name = index;
      else if (/^전입신고일자/.test(text)) column.moveIn = index;
      else if (/^확정일자/.test(text)) column.fixed = index;
      else if (/^보증금/.test(text)) column.deposit = index;
      else if (/^차임/.test(text)) column.rent = index;
      else if (/^배분요구\s*일자/.test(text)) column.requestedAt = index;
    });

    for (let r = headerIndex + 1; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      const first = clean(row.find((cell) => clean(cell) !== ""));
      if (first === "" ) continue;
      if (first.startsWith("▣") || first.startsWith("*")) break;
      const cell = (key: string) => (column[key] === undefined ? "" : clean(row[column[key]]));
      const name = cell("name");
      if (name === "") continue;

      const housing = options.isHousing === undefined || options.isHousing === null ? isHousing : options.isHousing;
      const values: FormValues = {
        creditor: name,
        amount: toAmount(cell("deposit")),
        moveInDate: toDate(cell("moveIn")),
        fixedDate: toDate(cell("fixed")),
        isHousing: housing === null ? "" : housing ? "yes" : "no",
        region: options.region ?? "",
        requestedDistribution: toDate(cell("requestedAt")) ? "yes" : "",
      };
      if (housing === false) values.monthlyRent = toAmount(cell("rent"));
      if (values.amount === "") warnings.push(`${where(grid, r)}: 임차인의 보증금을 읽지 못해 빈칸으로 두었습니다.`);
      claims.push({ source: where(grid, r), kind: "lease", values, taxItems: [] });
    }
  }
  return { claims, tableFound };
}

/** 배분요구 및 채권신고 현황 표를 읽는다. 표가 여러 시트에 걸쳐 있으면 이어서 읽는다. */
function readRights(grids: readonly SheetGrid[], tenantTableFound: boolean, tenantCount: number, warnings: string[]): ReadClaim[] {
  const claims: ReadClaim[] = [];
  let inTable = false;

  for (const grid of grids) {
    grid.rows.forEach((row, rowIndex) => {
      const cells = row.map((value, index) => ({ text: clean(value), index })).filter((cell) => cell.text !== "");
      if (cells.length === 0) return;

      if (cells.some((cell) => cell.text === "번호") && cells.some((cell) => cell.text === "권리관계")) {
        inTable = true;
        return;
      }
      if (!inTable) return;
      if (cells[0].text.startsWith("▣") || cells[0].text.startsWith("*")) {
        inTable = false;
        return;
      }
      if (!/^\d+$/.test(cells[0].text) || cells.length < 4) return;

      const relation = cells[1].text;
      // 성명(기관 이름)이 비어 있는 권리는 세 번째 값이 바로 날짜나 금액이다.
      const thirdIsValue = tokenize(cells[2].text).type !== "other";
      const name = thirdIsValue ? "" : cells[2].text;
      const tokens = cells.slice(thirdIsValue ? 2 : 3).map((cell) => tokenize(cell.text));

      const lastAmount = tokens.map((t) => t.type).lastIndexOf("amount");
      const amountTokens = tokens.filter((t): t is Extract<Token, { type: "amount" }> => t.type === "amount");
      // 표에는 설정금액과 배분요구 채권액 두 금액이 있다. 하나만 읽히면 어느 쪽인지 알 수 없어(예: 설정금액 0을
      // 채권액으로 잘못 읽을 수 있다) 추측하지 않고 건너뛴다.
      if (lastAmount === -1 || amountTokens.length < 2) {
        warnings.push(`${where(grid, rowIndex)}: 「${relation}」의 설정금액과 배분요구 채권액을 확실하게 읽지 못해 이 권리를 건너뛰었습니다. 직접 입력해 주세요.`);
        return;
      }
      const claimAmount = amountTokens[amountTokens.length - 1].value;
      const preDates = tokens.slice(0, lastAmount).filter((t): t is Extract<Token, { type: "date" }> => t.type === "date").map((t) => t.value);
      const range = tokens.slice(0, lastAmount).find((t): t is Extract<Token, { type: "range" }> => t.type === "range");
      // 금액 뒤에 오는 날짜가 배분요구일이다.
      const requestedAt = tokens.slice(lastAmount + 1).some((t) => t.type === "date");

      if (relation.includes("임차인")) {
        if (!tenantTableFound) {
          warnings.push(`${where(grid, rowIndex)}: 임차인 표를 찾지 못해 임차인을 읽지 못했습니다. 직접 입력해 주세요.`);
        } else if (tenantCount === 0) {
          warnings.push(`${where(grid, rowIndex)}: 「임차인 배분 요구 및 채권신고 현황」 표에 임차인 내용이 없어(배분요구 없음) 임차인은 읽지 않았습니다.`);
        }
        return;
      }

      const classified = classify(relation, name);
      if (!classified) {
        warnings.push(`${where(grid, rowIndex)}: 「${relation}」${name ? ` ${name}` : ""}의 권리 종류를 정하지 못해 건너뛰었습니다. 직접 입력해 주세요.`);
        return;
      }

      const requested = requestedAt ? "yes" : "";
      const source = where(grid, rowIndex);
      switch (classified.kind) {
        case "mortgage":
        case "jeonse":
        case "provisionalSeizure":
          claims.push({
            source,
            kind: classified.kind,
            values: { creditor: name, amount: claimAmount, registrationDate: preDates[0] ?? "", requestedDistribution: requested },
            taxItems: [],
          });
          break;
        case "securityProvisionalRegistration":
          claims.push({ source, kind: classified.kind, values: { creditor: name, amount: claimAmount, requestedDistribution: requested }, taxItems: [] });
          break;
        case "publicCharge":
          claims.push({
            source,
            kind: "publicCharge",
            values: { creditor: name, amount: claimAmount, dueDate: range?.start ?? preDates[0] ?? "", requestedDistribution: requested },
            taxItems: [],
          });
          break;
        case "tax": {
          // 압류일과 법정기일: 날짜가 둘이면 앞이 압류일, 기간이 있으면 시작일이 법정기일이다.
          const seizing = relation.includes("압류") || relation.includes("위임기관");
          let seizureDate = "";
          let legalDueDate = "";
          if (range) {
            legalDueDate = range.start;
            seizureDate = seizing ? (preDates[0] ?? "") : "";
          } else if (preDates.length >= 2) {
            seizureDate = preDates[0];
            legalDueDate = preDates[1];
          } else if (seizing) {
            seizureDate = preDates[0] ?? "";
            warnings.push(`${source}: 법정기일이 없어 빈칸으로 두었습니다. 압류일(${seizureDate || "없음"})만 읽었습니다.`);
          } else {
            legalDueDate = preDates[0] ?? "";
          }
          claims.push({
            source,
            kind: "tax",
            values: {
              creditor: name,
              amount: claimAmount,
              taxType: classified.taxType,
              seizureDate,
              // 명세서에 별도 표기가 없으면 납세담보는 없음, 당해세는 아님으로 읽는다 (담당자 확인).
              hasTaxCollateral: "no",
              requestedDistribution: requested,
            },
            taxItems: [{ name: "(세목 미기재)", legalDueDate, amount: claimAmount, isDangHaeSe: "no" }],
          });
          if (legalDueDate === "") warnings.push(`${source}: 법정기일을 읽지 못해 빈칸으로 두었습니다.`);
          break;
        }
      }
    });
  }
  return claims;
}

/**
 * 공매재산명세서(엑셀)의 시트들에서 권리를 읽는다.
 * 읽지 못한 값은 추측하지 않고 빈칸으로 두며, `warnings`에 이유를 남긴다.
 */
export function readStatementGrids(grids: readonly SheetGrid[], options: ReadOptions = {}): StatementRead {
  const warnings: string[] = [];
  const { addressText, isHousing } = readProperty(grids);
  const { claims: tenants, tableFound } = readTenants(grids, options, isHousing, warnings);
  const rights = readRights(grids, tableFound, tenants.length, warnings);

  if (tenants.length + rights.length === 0) {
    warnings.push("읽을 수 있는 권리를 찾지 못했습니다. 공매재산명세서 엑셀이 맞는지 확인해 주세요.");
  }
  if (tenants.length > 0 && isHousing === null && (options.isHousing === undefined || options.isHousing === null)) {
    warnings.push("재산 표시에서 주택인지 알 수 없어 임차인의 주택 여부를 빈칸으로 두었습니다.");
  }
  return { claims: [...tenants, ...rights], warnings, addressText, isHousing };
}
