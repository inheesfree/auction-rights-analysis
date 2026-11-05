// Design Ref: §3.1 순위 판단(Judgment) — 비교 대상 두 채권, 비교한 기준일, 적용 규칙 번호, 적용 법령 조문, 결과, 근거 문구
// Plan SC: 작업 5 — 모든 순위 판단에 근거(비교한 기준일, 적용 규칙, 법령)를 함께 남긴다
//
// 규칙 함수는 "누가 먼저인가"만 판단한다. 금액 계산(안분 포함)은 이후 작업(8~)에서 한다.
// 입력값 검사(lib/validate.ts)를 통과한 채권만 넣는다. 날짜가 비어 있으면 오류를 낸다.

import { claimLabel } from "../claimLabel";
import { formatDate } from "../dates";
import type { Blank, Claim, DateString, TaxClaim, TaxItem } from "../types";

/**
 * 판단 결과.
 * - a / b: 그 채권이 먼저 배분받는다
 * - equal: 동순위로 안분한다
 * - undetermined: 담당자 기준이 아직 정해지지 않아 판단하지 않는다. 계산을 멈추고
 *   "이 앱이 다루지 않는 경우"로 안내해야 한다 (틀린 숫자를 내지 않기 위해).
 */
export type Winner = "a" | "b" | "equal" | "undetermined";

export interface JudgedClaim {
  id: string;
  /** 알아볼 이름. 예: "근저당권(A은행)" */
  label: string;
}

export interface Judgment {
  /** 규칙 번호 (`판단규칙_초안.md`의 규칙 번호). 번호가 없는 기본 원칙(등기 순서 등)은 `null`. */
  ruleNo: number | null;
  ruleName: string;
  a: JudgedClaim;
  b: JudgedClaim;
  winner: Winner;
  /** 비교한 기준일을 사람이 읽는 글로 적은 것. 예: "근저당권 등기 접수일 2020년 1월 10일" */
  comparedDates: string[];
  /** 적용한 법령 조문. 없으면 `null`. */
  law: string | null;
  /** `true`이면 법적 근거를 확인하지 못한 담당자 업무 기준을 적용한 판단이다 (법령정리.md 8번). */
  legalBasisUnverified: boolean;
  /** 판단 이유 한 줄. */
  reason: string;
  /** `true`이면 이 판단 뒤에 규칙 5(당해세 → 임차인 대신 변제) 조정 계산을 적용한다 (lib/rule5.ts). */
  rule5Adjustment?: boolean;
}

/** 조세의 세목 하나. 세목마다 법정기일이 달라서 세목 단위로 비교한다. */
export interface TaxPart {
  claim: TaxClaim;
  item: TaxItem;
}

/** 비교 대상 a와 b를 맞바꾼다. 결과(winner)도 함께 뒤집는다. */
export function swapJudgment(judgment: Judgment): Judgment {
  const flipped: Record<Winner, Winner> = { a: "b", b: "a", equal: "equal", undetermined: "undetermined" };
  return { ...judgment, a: judgment.b, b: judgment.a, winner: flipped[judgment.winner] };
}

export function judgedClaim(claim: Claim): JudgedClaim {
  return { id: claim.id, label: claimLabel(claim) };
}

export function taxPartLabel(part: TaxPart): string {
  return `${claimLabel(part.claim)} ${part.item.name || "세목"}`;
}

export function judgedTaxPart(part: TaxPart): JudgedClaim {
  return { id: part.claim.id, label: taxPartLabel(part) };
}

/** 날짜가 비어 있으면 오류를 낸다. (입력값 검사를 통과한 채권만 넣어야 한다.) */
export function requireDate(date: Blank<DateString>, label: string): DateString {
  if (date === null) {
    throw new RangeError(`${label}이(가) 없어 순위를 비교할 수 없습니다. 입력값 검사를 먼저 통과해야 합니다.`);
  }
  return date;
}

/** 비교한 기준일을 한 줄로 적는다. 예: "근저당권 등기 접수일 2020년 1월 10일" */
export function dateLine(label: string, date: DateString): string {
  return `${label} ${formatDate(date)}`;
}
