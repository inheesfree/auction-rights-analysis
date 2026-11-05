// 캡처 이미지를 OCR로 읽은 글자에서 입력 양식 칸에 채울 값을 뽑는다.
// Design Ref: PRD "읽기만 AI(자동)가 하고, 판단·계산은 정해진 규칙으로" — 여기는 읽은 글자를 칸으로 옮기는 일만 한다.
// 담당자 확인 (2026-11-05): OCR 값은 입력 양식에 채워 보여 주고, 담당자가 확인·수정한 뒤 「채권 추가」를 눌러야 쓴다.
//
// 원칙
// - 추측하지 않는다. 날짜는 바로 앞에 칸 이름(전입·확정일자·설정·납부기한 등)이 있을 때만 그 칸에 넣는다.
// - 같은 칸에 서로 다른 값이 둘 이상 읽히면 어느 것이 맞는지 모르므로 빈칸으로 두고 알려준다.
// - 채권자 이름은 가져오지 않는다(개인정보). 주민등록번호처럼 보이는 값은 읽기 전에 가린다.
// - 화면(components/)과 분리된 순수 함수다. 같은 글자면 항상 같은 결과가 나온다.

import { COMMON_FIELDS, fieldsForKind, TAX_ITEM_FIELDS, type FormValues } from "./claimForm";
import { isValidDate } from "./dates";
import { maskResidentNumbers } from "./privacy";
import type { RightKind } from "./types";

export interface OcrParseResult {
  /** 글자로 정할 수 있었던 권리 종류. 여러 종류로 읽히거나 단서가 없으면 `null`(담당자가 고른다). */
  kind: RightKind | null;
  /** 입력 양식의 공통·종류별 칸에 채울 값. */
  values: FormValues;
  /** 조세의 세목 칸에 채울 값(조세일 때만). */
  taxItems: FormValues[];
  /** 채운 칸을 "칸 이름 값" 모양으로 알려 준다. */
  filled: string[];
  /** 담당자가 알아 둘 것(권리 종류 불명, 값이 둘 이상이라 비운 칸 등). */
  notes: string[];
}

/** OCR은 한글 글자 사이에 공백을 넣는 일이 많아, 한글끼리 붙은 공백을 없앤 줄을 만든다. */
function compactLine(line: string): string {
  return line.replace(/(?<=[가-힣])[ \t]+(?=[가-힣])/g, "");
}

const DATE_PATTERN = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/g;

/** 날짜 바로 앞에 있는 칸 이름 → 입력 양식 칸 이름. 앞에서 가장 가까운 단서를 쓴다. */
const DATE_LABELS: { pattern: RegExp; key: string }[] = [
  { pattern: /전입/g, key: "moveInDate" },
  { pattern: /확정/g, key: "fixedDate" },
  { pattern: /압류/g, key: "seizureDate" },
  { pattern: /법정기일/g, key: "legalDueDate" },
  { pattern: /납부기한|납기/g, key: "dueDate" },
  { pattern: /설정|접수|등기/g, key: "registrationDate" },
];

const AMOUNT_PATTERN = /(채권최고액|채권액|청구금액|청구액|체납액|보증금|금액)\s*[:：]?\s*(?:일금|금)?\s*(\d[\d,]*\d|\d)\s*원?/g;

const KIND_CLUES: { kind: RightKind; pattern: RegExp }[] = [
  { kind: "dispositionCost", pattern: /체납처분비/ },
  { kind: "mortgage", pattern: /근저당/ },
  { kind: "provisionalSeizure", pattern: /가압류/ },
  { kind: "jeonse", pattern: /전세권/ },
  { kind: "lease", pattern: /임차|보증금|확정일자|전입/ },
  { kind: "tax", pattern: /세무서|국세|지방세|세목|법정기일|교부청구/ },
  { kind: "publicCharge", pattern: /건강보험|국민연금|산재보험|고용보험|공과금/ },
  { kind: "wage", pattern: /임금|체불/ },
];

function detectKind(text: string): RightKind | null {
  const found = new Set(KIND_CLUES.filter((c) => c.pattern.test(text)).map((c) => c.kind));
  // 건강보험 같은 공과금·임금 서류도 "교부청구"라는 말을 쓰므로, 그럴 때는 조세로 보지 않는다.
  if (found.has("tax") && (found.has("publicCharge") || found.has("wage"))) found.delete("tax");
  return found.size === 1 ? [...found][0] : null;
}

/** 값 후보 모음. 서로 다른 값이 둘 이상이면 비운다. */
function pick(candidates: string[] | undefined): { value: string | null; conflict: boolean } {
  const distinct = [...new Set(candidates ?? [])];
  if (distinct.length === 1) return { value: distinct[0], conflict: false };
  return { value: null, conflict: distinct.length > 1 };
}

/**
 * OCR로 읽은 글자에서 입력 양식에 채울 값을 뽑는다.
 * 읽을 수 없거나 확실하지 않은 값은 비워 두고, 이유를 `notes`로 알려 준다.
 */
export function parseOcrText(rawText: string): OcrParseResult {
  const text = maskResidentNumbers(rawText);
  const lines = text.split(/\r?\n/).map(compactLine);
  const whole = lines.join("\n");

  const kind = detectKind(whole);
  const notes: string[] = [];
  const candidates: Record<string, string[]> = {};
  const add = (key: string, value: string) => {
    (candidates[key] ??= []).push(value);
  };

  for (const line of lines) {
    // 날짜: 바로 앞에 칸 이름이 있을 때만 쓴다.
    for (const match of line.matchAll(DATE_PATTERN)) {
      const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      if (!isValidDate(iso)) continue;
      const before = line.slice(0, match.index);
      let best: { key: string; end: number } | null = null;
      for (const { pattern, key } of DATE_LABELS) {
        for (const label of before.matchAll(pattern)) {
          const end = (label.index ?? 0) + label[0].length;
          if (best === null || end > best.end) best = { key, end };
        }
      }
      if (best !== null) add(best.key, iso);
    }
    // 금액
    for (const match of line.matchAll(AMOUNT_PATTERN)) add("amount", match[2].replace(/,/g, ""));
    // 등기 접수번호
    const number = /접수번호\s*[:：]?\s*(?:제\s*)?(\d+(?:-\d+)?)\s*호?/.exec(line);
    if (number) add("registrationNumber", number[1]);
    // 세목 이름
    const taxName = /세목\s*[:：]?\s*([가-힣]{2,12})/.exec(line);
    if (taxName) add("name", taxName[1]);
  }

  // 국세/지방세: 서류에 한쪽 단서만 있을 때만 정한다.
  const national = /세무서|국세/.test(whole);
  const local = /구청|시청|군청|지방세/.test(whole);
  if (kind === "tax" && national !== local) add("taxType", national ? "national" : "local");

  // 칸으로 옮긴다. 채우는 칸은 정해진 권리 종류의 칸뿐이다(종류를 모르면 공통 칸의 채권액만).
  const values: FormValues = {};
  const taxItem: FormValues = {};
  const filled: string[] = [];
  const conflicts: string[] = [];
  const allowed = kind === null ? COMMON_FIELDS : [...COMMON_FIELDS, ...fieldsForKind(kind)];
  // 세목별 금액은 세목마다 달라 글자만으로 가리기 어려우므로 채우지 않는다(채권액만 채운다).
  const taxAllowed = kind === "tax" ? TAX_ITEM_FIELDS.filter((def) => def.key !== "amount") : [];

  for (const def of [...allowed, ...taxAllowed]) {
    if (def.key === "creditor") continue; // 이름은 가져오지 않는다.
    const { value, conflict } = pick(candidates[def.key]);
    if (conflict) conflicts.push(def.label);
    if (value === null) continue;
    const target = taxAllowed.includes(def) ? taxItem : values;
    target[def.key] = value;
    filled.push(`${def.label} ${value}`);
  }

  if (kind === null) {
    notes.push("서류 글자만으로 권리 종류를 정할 수 없습니다. 권리 종류를 직접 고른 뒤 나머지 칸을 확인해 주세요.");
  }
  if (conflicts.length > 0) {
    notes.push(`서로 다른 값이 둘 이상 읽혀 빈칸으로 둔 칸: ${conflicts.join(", ")}.`);
  }

  return { kind, values, taxItems: kind === "tax" ? [taxItem] : [], filled, notes };
}
