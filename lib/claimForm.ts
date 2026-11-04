// Design Ref: §3.2 — 권리 종류별 입력 항목, §2.2 ③ 확인 표의 칸
// Plan SC: 작업 3 — 권리 종류에 따라 필요한 입력칸이 나타나게 하고, 입력 글자를 채권(Claim)으로 바꾼다
//
// 화면(components/)과 분리된 순수 함수만 둔다. 같은 입력이면 항상 같은 결과가 나온다.
// 입력값 검사와 "다루지 않는 경우" 안내는 작업 4에서 만든다. 여기서는 글자를 읽을 수 없을 때
// 추측하지 않고 빈칸(null)으로 두고, 어떤 칸이 읽히지 않았는지만 알려준다.

import { formatDate, laterDate, parseDate } from "./dates";
import { formatWon, parseWon } from "./money";
import type {
  Blank,
  Claim,
  DateString,
  RightKind,
  SupportedRightKind,
  TaxItem,
  TaxType,
  WageType,
  Won,
} from "./types";

// ---------------------------------------------------------------------------
// 입력칸 정의
// ---------------------------------------------------------------------------

/** 입력칸의 모양. */
export type FieldType = "text" | "won" | "date" | "yesNo" | "taxType" | "wageType";

export interface FieldDef {
  /** 입력값을 담는 이름. */
  key: string;
  /** 화면에 보여줄 이름. */
  label: string;
  type: FieldType;
  /** 입력 도움말. */
  hint?: string;
}

/** 입력 글자 모음. 칸 이름 → 입력한 글자. */
export type FormValues = Record<string, string>;

/** 모든 권리가 공통으로 받는 칸. */
export const COMMON_FIELDS: FieldDef[] = [
  {
    key: "creditor",
    label: "채권자",
    type: "text",
    hint: "이름이 꼭 필요하지 않으면 마스킹된 상태(예: 홍○○)로 입력하세요",
  },
  { key: "amount", label: "채권액", type: "won", hint: "예: 200,000,000" },
  { key: "requestedDistribution", label: "배분요구 여부", type: "yesNo" },
];

const REGISTRATION_FIELDS: FieldDef[] = [
  { key: "registrationDate", label: "등기 접수일", type: "date", hint: "예: 2020-01-10" },
  { key: "registrationNumber", label: "등기 접수번호", type: "text", hint: "같은 날짜일 때 선후를 가립니다" },
];

/** 권리 종류별로 추가로 받는 칸 (DESIGN 3.2 표). 조세의 세목은 아래 `TAX_ITEM_FIELDS`로 따로 받는다. */
export const KIND_FIELDS: Record<SupportedRightKind, FieldDef[]> = {
  mortgage: REGISTRATION_FIELDS,
  jeonse: [...REGISTRATION_FIELDS, { key: "isHousing", label: "주택 여부", type: "yesNo" }],
  lease: [
    { key: "moveInDate", label: "전입일", type: "date", hint: "예: 2021-03-02" },
    { key: "fixedDate", label: "확정일자", type: "date", hint: "전입일과 확정일자 중 늦은 날이 기준일입니다" },
    { key: "isHousing", label: "주택 여부", type: "yesNo" },
    { key: "location", label: "소재지", type: "text", hint: "소액임차 기준표 확정 후 필요 여부를 정합니다" },
    { key: "contractDate", label: "임대차 계약 시점", type: "date", hint: "소액임차 기준표 확정 후 필요 여부를 정합니다" },
  ],
  tax: [
    { key: "taxType", label: "국세/지방세", type: "taxType" },
    { key: "seizureDate", label: "압류일", type: "date", hint: "교부청구만 했으면 비워 두세요" },
    { key: "hasParticipatingSeizure", label: "참가압류 여부", type: "yesNo" },
    { key: "hasTaxCollateral", label: "납세담보 여부", type: "yesNo", hint: "담보가 있는 조세는 다른 조세보다 우선합니다" },
  ],
  publicCharge: [{ key: "dueDate", label: "납부기한", type: "date", hint: "법정기일처럼 비교합니다" }],
  wage: [{ key: "wageType", label: "임금 구분", type: "wageType" }],
  provisionalSeizure: [
    { key: "registrationDate", label: "가압류 등기일", type: "date", hint: "예: 2019-05-20" },
    { key: "registrationNumber", label: "등기 접수번호", type: "text" },
  ],
  dispositionCost: [],
};

/** 조세의 세목 하나를 받는 칸. 한 건의 교부청구 안에 세목이 여러 개일 수 있다. */
export const TAX_ITEM_FIELDS: FieldDef[] = [
  { key: "name", label: "세목", type: "text", hint: "예: 종합부동산세" },
  { key: "legalDueDate", label: "법정기일", type: "date", hint: "세목마다 다릅니다" },
  { key: "amount", label: "세목별 금액", type: "won" },
  { key: "isDangHaeSe", label: "당해세 여부", type: "yesNo" },
];

/**
 * 권리 종류 선택에 쓰는 순서.
 * 이 앱이 다루지 않는 권리(담보가등기, 필요비·유익비)도 고를 수 있게 마지막에 둔다.
 * 고르면 계산하지 않고 "이 앱이 다루지 않는 경우"로 안내한다 (lib/validate.ts).
 */
export const SELECTABLE_KINDS: RightKind[] = [
  "mortgage",
  "lease",
  "tax",
  "publicCharge",
  "wage",
  "provisionalSeizure",
  "jeonse",
  "dispositionCost",
  "securityProvisionalRegistration",
  "necessaryExpense",
];

/** 권리 종류에 따라 추가로 받는 칸. 다루지 않는 권리는 공통 칸만 받는다. */
export function fieldsForKind(kind: RightKind): FieldDef[] {
  return kind in KIND_FIELDS ? KIND_FIELDS[kind as SupportedRightKind] : [];
}

// ---------------------------------------------------------------------------
// 입력 글자 → 채권
// ---------------------------------------------------------------------------

/** 글자를 읽지 못한 칸 이름을 모아 두는 상자. */
type Unreadable = string[];

function toText(raw: string | undefined): Blank<string> {
  const text = (raw ?? "").trim();
  return text === "" ? null : text;
}

function toWon(raw: string | undefined, label: string, bad: Unreadable): Blank<Won> {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const value = parseWon(text);
  if (value === null) bad.push(label);
  return value;
}

function toDate(raw: string | undefined, label: string, bad: Unreadable): Blank<DateString> {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const value = parseDate(text);
  if (value === null) bad.push(label);
  return value;
}

function toYesNo(raw: string | undefined): Blank<boolean> {
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return null;
}

function toTaxType(raw: string | undefined): Blank<TaxType> {
  return raw === "national" || raw === "local" ? raw : null;
}

function toWageType(raw: string | undefined): Blank<WageType> {
  return raw === "last3Months" || raw === "general" ? raw : null;
}

/** 입력 글자로 채권을 만든 결과. */
export interface BuiltClaim {
  claim: Claim;
  /** 글자는 있었지만 날짜·금액으로 읽지 못해 빈칸으로 둔 칸 이름. */
  unreadable: string[];
}

/**
 * 입력 글자를 채권(Claim)으로 바꾼다.
 * 읽지 못한 값은 추측해서 채우지 않고 빈칸(null)으로 두며, `unreadable`에 칸 이름을 알려준다.
 */
export function buildClaim(
  id: string,
  kind: RightKind,
  values: FormValues,
  taxItems: FormValues[],
  isEntrusted: boolean,
): BuiltClaim {
  const bad: Unreadable = [];
  const base = {
    id,
    creditor: (values.creditor ?? "").trim(),
    amount: toWon(values.amount, "채권액", bad),
    requestedDistribution: toYesNo(values.requestedDistribution),
    ...(isEntrusted ? { isEntrusted: true } : {}),
  };

  let claim: Claim;
  switch (kind) {
    case "securityProvisionalRegistration":
    case "necessaryExpense":
      // 이 앱이 다루지 않는 권리: 공통 항목만 담아 두고 계산에는 넣지 않는다.
      claim = { ...base, kind };
      break;
    case "mortgage":
      claim = {
        ...base,
        kind,
        registrationDate: toDate(values.registrationDate, "등기 접수일", bad),
        registrationNumber: toText(values.registrationNumber),
      };
      break;
    case "jeonse":
      claim = {
        ...base,
        kind,
        registrationDate: toDate(values.registrationDate, "등기 접수일", bad),
        registrationNumber: toText(values.registrationNumber),
        isHousing: toYesNo(values.isHousing),
      };
      break;
    case "lease":
      claim = {
        ...base,
        kind,
        moveInDate: toDate(values.moveInDate, "전입일", bad),
        fixedDate: toDate(values.fixedDate, "확정일자", bad),
        isHousing: toYesNo(values.isHousing),
        location: toText(values.location),
        contractDate: toDate(values.contractDate, "임대차 계약 시점", bad),
      };
      break;
    case "tax": {
      const items: TaxItem[] = taxItems.map((item, index) => {
        const n = index + 1;
        return {
          name: (item.name ?? "").trim(),
          legalDueDate: toDate(item.legalDueDate, `세목 ${n} 법정기일`, bad),
          amount: toWon(item.amount, `세목 ${n} 금액`, bad),
          isDangHaeSe: toYesNo(item.isDangHaeSe),
        };
      });
      claim = {
        ...base,
        kind,
        taxType: toTaxType(values.taxType),
        items,
        seizureDate: toDate(values.seizureDate, "압류일", bad),
        hasParticipatingSeizure: toYesNo(values.hasParticipatingSeizure),
        hasTaxCollateral: toYesNo(values.hasTaxCollateral),
      };
      break;
    }
    case "publicCharge":
      claim = { ...base, kind, dueDate: toDate(values.dueDate, "납부기한", bad) };
      break;
    case "wage":
      claim = { ...base, kind, wageType: toWageType(values.wageType) };
      break;
    case "provisionalSeizure":
      claim = {
        ...base,
        kind,
        registrationDate: toDate(values.registrationDate, "가압류 등기일", bad),
        registrationNumber: toText(values.registrationNumber),
      };
      break;
    case "dispositionCost":
      claim = { ...base, kind };
      break;
  }

  return { claim, unreadable: bad };
}

// ---------------------------------------------------------------------------
// 채권 → 확인 표 한 줄
// ---------------------------------------------------------------------------

/** 확인 표의 한 칸. `blank`가 `true`이면 빈칸이라 눈에 띄게 표시한다. */
export interface Cell {
  text: string;
  blank: boolean;
}

/** 확인 표 한 줄에 보여줄 내용. */
export interface ClaimRow {
  id: string;
  kind: Claim["kind"];
  creditor: Cell;
  /** 기준일. 세목이 여러 개인 조세는 여러 줄이 된다. 기준일이 필요 없는 권리는 빈 목록. */
  baseDates: Cell[];
  amount: Cell;
  registrationNumber: Cell | null;
  /** 그 밖에 알아 둘 것 (주택 여부, 국세/지방세 등). */
  notes: Cell[];
}

const BLANK = "(빈칸)";

function dateCell(label: string, date: Blank<DateString>): Cell {
  return date === null
    ? { text: `${label} ${BLANK}`, blank: true }
    : { text: `${label} ${formatDate(date)}`, blank: false };
}

function yesNoNote(label: string, value: Blank<boolean>): Cell {
  if (value === null) return { text: `${label} ${BLANK}`, blank: true };
  return { text: `${label} ${value ? "예" : "아니오"}`, blank: false };
}

/** 채권을 확인 표 한 줄로 바꾼다. 비어 있는 값은 `blank: true`로 표시한다. */
export function toClaimRow(claim: Claim): ClaimRow {
  const row: ClaimRow = {
    id: claim.id,
    kind: claim.kind,
    creditor:
      claim.creditor === ""
        ? { text: BLANK, blank: true }
        : { text: claim.creditor, blank: false },
    baseDates: [],
    amount:
      claim.amount === null
        ? { text: BLANK, blank: true }
        : { text: formatWon(claim.amount), blank: false },
    registrationNumber: null,
    notes: [],
  };

  if (claim.requestedDistribution !== null) {
    row.notes.push(yesNoNote("배분요구", claim.requestedDistribution));
  }
  if (claim.isEntrusted) row.notes.push({ text: "수임 채권", blank: false });

  switch (claim.kind) {
    case "mortgage":
    case "provisionalSeizure":
      row.baseDates = [dateCell(claim.kind === "mortgage" ? "접수일" : "등기일", claim.registrationDate)];
      row.registrationNumber = claim.registrationNumber === null
        ? { text: BLANK, blank: true }
        : { text: claim.registrationNumber, blank: false };
      break;
    case "jeonse":
      row.baseDates = [dateCell("접수일", claim.registrationDate)];
      row.registrationNumber = claim.registrationNumber === null
        ? { text: BLANK, blank: true }
        : { text: claim.registrationNumber, blank: false };
      row.notes.push(yesNoNote("주택", claim.isHousing));
      break;
    case "lease": {
      // 기준일 = 전입일과 확정일자 중 늦은 날. 하나라도 비어 있으면 기준일을 정하지 않는다.
      if (claim.moveInDate !== null && claim.fixedDate !== null) {
        row.baseDates = [
          { text: `${formatDate(laterDate(claim.moveInDate, claim.fixedDate))} (전입일·확정일자 중 늦은 날)`, blank: false },
        ];
      } else {
        row.baseDates = [
          dateCell("전입일", claim.moveInDate),
          dateCell("확정일자", claim.fixedDate),
        ];
      }
      row.notes.push(yesNoNote("주택", claim.isHousing));
      break;
    }
    case "tax": {
      row.baseDates =
        claim.items.length === 0
          ? [{ text: `세목 ${BLANK}`, blank: true }]
          : claim.items.map((item) => dateCell(`${item.name || "세목"} 법정기일`, item.legalDueDate));
      if (claim.taxType !== null) {
        row.notes.push({ text: claim.taxType === "national" ? "국세" : "지방세", blank: false });
      } else {
        row.notes.push({ text: `국세/지방세 ${BLANK}`, blank: true });
      }
      for (const item of claim.items) {
        if (item.isDangHaeSe === true) row.notes.push({ text: `${item.name || "세목"}: 당해세`, blank: false });
      }
      if (claim.seizureDate !== null) row.notes.push(dateCell("압류일", claim.seizureDate));
      if (claim.hasParticipatingSeizure === true) row.notes.push({ text: "참가압류", blank: false });
      row.notes.push(
        claim.hasTaxCollateral === null
          ? { text: `납세담보 ${BLANK}`, blank: true }
          : { text: claim.hasTaxCollateral ? "납세담보 있음" : "납세담보 없음", blank: false },
      );
      break;
    }
    case "publicCharge":
      row.baseDates = [dateCell("납부기한", claim.dueDate)];
      break;
    case "wage":
      row.notes.push(
        claim.wageType === null
          ? { text: `임금 구분 ${BLANK}`, blank: true }
          : { text: claim.wageType === "last3Months" ? "최종 3개월분" : "일반 임금", blank: false },
      );
      break;
    case "dispositionCost":
      break;
    case "securityProvisionalRegistration":
    case "necessaryExpense":
      row.notes.push({ text: "이 앱이 다루지 않는 권리", blank: false });
      break;
  }

  return row;
}
