// 채권을 사람이 알아볼 이름으로 바꾼다. 입력 검사(validate.ts)와 순위 판단 근거(rules/)가 같이 쓴다.

import { RIGHT_KIND_LABELS, type Claim } from "./types";

/** 예: "근저당권(A은행)". 채권자 이름이 비어 있으면 "채권자 미입력"으로 표시한다. */
export function claimLabel(claim: Claim): string {
  const who = claim.creditor === "" ? "채권자 미입력" : claim.creditor;
  return `${RIGHT_KIND_LABELS[claim.kind]}(${who})`;
}
