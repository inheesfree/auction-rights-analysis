// Design Ref: §4 lib/rules/ — 규칙 8: 근저당권 vs 가압류
// 판단규칙_초안.md 규칙 8. 법령 근거를 아직 확인하지 못해 모든 결과를 "법적 근거 미확인"으로 표시한다.
//
// 같은 날이면 "등기 접수번호로 선후 판단"이라는 초안이 담당자 확인 전이라(확인 필요) 구현하지 않고,
// 판단하지 않음(undetermined)으로 돌려준다.
// 선행 가압류·후행 근저당·근저당보다 늦은 법정기일의 국세가 함께 있는 조합(순환 배분 유형 2)은
// 세 채권을 함께 봐야 알 수 있으므로 작업 11에서 거른다.

import { compareDates } from "../dates";
import type { MortgageClaim, ProvisionalSeizureClaim } from "../types";
import { dateLine, judgedClaim, requireDate, type Judgment } from "./judgment";

/**
 * 근저당권(a)과 가압류(b)를 비교한다.
 * - 근저당권이 먼저 설정됨: 담보권이므로 근저당권 우선
 * - 가압류가 먼저 등기됨: 선행 가압류에 저촉되는 후행 근저당권은 우선권을 주장하지 못해 안분 관계
 * - 같은 날: 담당자 확인 전이라 판단하지 않음
 */
export function judgeMortgageVsProvisional(mortgage: MortgageClaim, seizure: ProvisionalSeizureClaim): Judgment {
  const mortgageDate = requireDate(mortgage.registrationDate, "근저당권 설정일자");
  const seizureDate = requireDate(seizure.registrationDate, "가압류 등기일");
  const order = compareDates(mortgageDate, seizureDate);

  const base = {
    ruleNo: 8,
    ruleName: "근저당권 vs 가압류",
    a: judgedClaim(mortgage),
    b: judgedClaim(seizure),
    comparedDates: [dateLine("근저당권 설정일자", mortgageDate), dateLine("가압류 등기일", seizureDate)],
    law: null,
    legalBasisUnverified: true,
  };

  if (order < 0) {
    return { ...base, winner: "a", reason: "근저당권이 가압류보다 먼저 설정되어 근저당권이 우선합니다. (담당자 업무 기준, 법적 근거 미확인)" };
  }
  if (order > 0) {
    return {
      ...base,
      winner: "equal",
      reason: "가압류가 먼저 등기되어, 후행 근저당권은 가압류채권자에게 우선권을 주장하지 못하므로 안분 관계입니다. (담당자 업무 기준, 법적 근거 미확인)",
    };
  }
  return {
    ...base,
    winner: "undetermined",
    reason: "근저당권과 가압류가 같은 날인 경우의 처리 방식이 정해지지 않았습니다(등기 접수번호로 가릴지 담당자 확인 필요). 이 경우는 이 앱이 판단하지 않습니다.",
  };
}
