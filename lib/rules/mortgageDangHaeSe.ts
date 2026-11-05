// Design Ref: §4 lib/rules/ — 규칙 3: 근저당권 vs 당해세
// 판단규칙_초안.md 규칙 3. 주택임차보증금과의 관계는 규칙 5(작업 10)가 우선 적용된다.

import { dateLine, judgedClaim, judgedTaxPart, requireDate, type Judgment, type TaxPart } from "./judgment";
import type { MortgageClaim } from "../types";

/**
 * 근저당권(a)과 당해세 세목(b)을 비교한다.
 * 해당 재산에 부과된 당해세는 날짜와 상관없이 근저당권보다 우선한다.
 * (국세 당해세: 상속세·증여세·종합부동산세, 지방세 당해세: 재산세 등 — 법령정리.md 8번)
 * 당해세가 아닌 세목은 규칙 1·2로 판단한다.
 */
export function judgeMortgageVsDangHaeSe(mortgage: MortgageClaim, tax: TaxPart): Judgment {
  if (tax.item.isDangHaeSe !== true) {
    throw new RangeError("당해세 세목만 이 규칙으로 판단합니다. 일반 조세는 규칙 1·2로 판단합니다.");
  }
  const taxType = tax.claim.taxType;
  if (taxType === null) throw new RangeError("국세/지방세 구분이 없어 규칙을 고를 수 없습니다.");

  const national = taxType === "national";
  const mortgageDate = requireDate(mortgage.registrationDate, "근저당권 설정일자");
  const legalDueDate = requireDate(tax.item.legalDueDate, "법정기일");

  return {
    ruleNo: 3,
    ruleName: "근저당권 vs 당해세",
    a: judgedClaim(mortgage),
    b: judgedTaxPart(tax),
    winner: "b",
    // 날짜는 결과에 영향을 주지 않지만 근거를 보여주기 위해 함께 남긴다.
    comparedDates: [
      dateLine(`${national ? "국세" : "지방세"} 법정기일`, legalDueDate),
      dateLine("근저당권 설정일자", mortgageDate),
    ],
    law: national ? "국세기본법 제35조 제3항" : "지방세기본법 제71조 (제5항: 당해세인 재산세 등의 범위)",
    legalBasisUnverified: false,
    reason: "당해세는 날짜와 상관없이 근저당권보다 우선합니다. (주택임차보증금이 함께 있으면 규칙 5로 조정합니다.)",
  };
}
