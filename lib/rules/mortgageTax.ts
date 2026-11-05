// Design Ref: §4 lib/rules/ — 규칙 1·2: 근저당권 vs 일반 국세·지방세
// 판단규칙_초안.md 규칙 1, 2 (같은 날이면 조세 우선은 담당자 업무 기준, 법적 근거 미확인)

import { compareDates } from "../dates";
import type { MortgageClaim } from "../types";
import {
  dateLine,
  judgedClaim,
  judgedTaxPart,
  requireDate,
  type Judgment,
  type TaxPart,
} from "./judgment";

/**
 * 근저당권(a)과 일반 조세(b)를 비교한다. 조세가 국세면 규칙 1, 지방세면 규칙 2다.
 * 비교하는 날짜: 조세 세목의 법정기일 ↔ 근저당권 등기 접수일.
 * 당해세는 날짜와 상관없이 우선하므로 이 규칙으로 판단하지 않는다 (규칙 3, 작업 6).
 */
export function judgeMortgageVsTax(mortgage: MortgageClaim, tax: TaxPart): Judgment {
  if (tax.item.isDangHaeSe !== false) {
    throw new RangeError("일반 조세(당해세가 아닌 세목)만 이 규칙으로 판단합니다. 당해세는 규칙 3·5로 판단합니다.");
  }
  const taxType = tax.claim.taxType;
  if (taxType === null) throw new RangeError("국세/지방세 구분이 없어 규칙을 고를 수 없습니다.");

  const national = taxType === "national";
  const mortgageDate = requireDate(mortgage.registrationDate, "근저당권 등기 접수일");
  const legalDueDate = requireDate(tax.item.legalDueDate, "법정기일");
  const order = compareDates(legalDueDate, mortgageDate);

  const taxName = national ? "국세" : "지방세";
  const comparedDates = [
    dateLine(`${taxName} 법정기일`, legalDueDate),
    dateLine("근저당권 등기 접수일", mortgageDate),
  ];
  const base = {
    ruleNo: national ? 1 : 2,
    ruleName: `근저당권 vs 일반 ${taxName}`,
    a: judgedClaim(mortgage),
    b: judgedTaxPart(tax),
    comparedDates,
    law: national ? "국세기본법 제35조 제1항" : "지방세기본법 제71조 제1항",
  };

  if (order < 0) {
    return { ...base, winner: "b", legalBasisUnverified: false, reason: `${taxName} 법정기일이 근저당권 설정일보다 빨라 ${taxName}가 우선합니다.` };
  }
  if (order > 0) {
    return { ...base, winner: "a", legalBasisUnverified: false, reason: `근저당권 설정일이 ${taxName} 법정기일보다 빨라 근저당권이 우선합니다.` };
  }
  return {
    ...base,
    winner: "b",
    legalBasisUnverified: true,
    reason: `같은 날이면 ${taxName}가 우선합니다. (담당자 업무 기준, 법적 근거 미확인)`,
  };
}
