// Design Ref: §3 ⑤ — 규칙 5: 당해세와 주택임차보증금 조정 (2023년 개정)
// Plan SC: 작업 10 — 당해세 우선 원칙으로 먼저 배분한 뒤, 임차인이 당해세의 우선징수액 범위에서 대신 변제받는다
//
// 담당자 확인 순서 (판단규칙_초안.md 규칙 5)
//   1. 당해세 우선 원칙에 따른 가상 배분액을 먼저 계산한다.            → lib/distribute.ts
//   2. 임차인보다 법정기일이 늦은 당해세의 우선 배분 예정액을 확인한다.  → 이 파일
//   3. 그 금액을 당해세가 아닌 임차인에게 배분한다.                     → 이 파일
//   4. 근저당권자 등 다른 채권의 배분액은 그대로 유지한다.              → 다른 줄은 건드리지 않는다
//
// 이 파일에서 정한 계산 방식 (확인 필요)
//   - 임차인이 받는 금액의 상한: 당해세의 가상 배분액과 임차인의 부족액(채권액 − 가상 배분액) 중 작은 금액
//     (조문은 "우선 징수할 수 있었던 당해세 징수액" 범위로 정하고, 임차인 부족분 한도라는 설명도 있어 둘 다 적용)
//   - 임차인이 여러 명이면 순위가 앞선 임차인부터, 당해세가 여러 세목이면 앞서 배분받는 세목부터 쓴다 (AI 가정)
//   - 적용 시점: 국세는 2023.4.1. 이후 매각결정 사건부터다(2차 자료). 지방세 시행일은 확인하지 못했다.
//     이 앱은 매각결정 시점을 입력받지 않으므로 확인하지 않는다.
//   - 대상: 확정일자를 갖춘 주택임차인(임차인 기준일 = 전입일·확정일자 중 늦은 날, 담당자 확인).
//     법 조문은 확정일자와 비교하는 것으로 읽히는 문구가 있어 원문 대조가 필요하다.

import { compareDates } from "./dates";
import { formatWon } from "./money";
import type { DistributionLine } from "./distribute";
import type { Participant } from "./rules";
import { leaseBaseDate } from "./rules/lease";
import type { Won } from "./types";

/** 당해세에서 임차인에게 옮긴 금액 한 건. */
export interface Rule5Transfer {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  amount: Won;
  /** 적용한 법령 조문. */
  law: string;
}

const NOTE_SCOPE = "(규칙 5는 국세 2023.4.1. 이후 매각결정 사건에 적용됩니다. 이 앱은 매각결정 시점을 확인하지 않습니다.)";

/**
 * 가상 배분(당해세 우선)이 끝난 줄에 규칙 5 조정을 적용한다. 배분액의 합계는 바뀌지 않는다.
 * 순수 함수다. 입력 줄을 바꾸지 않고 새 줄을 돌려준다.
 */
export function applyRule5(
  participants: readonly Participant[],
  lines: readonly DistributionLine[],
): { lines: DistributionLine[]; transfers: Rule5Transfer[] } {
  const byKey = new Map(lines.map((line) => [line.key, { ...line, notes: [...line.notes] }]));
  const transfers: Rule5Transfer[] = [];
  const rankOf = (key: string) => byKey.get(key)?.rank ?? Number.MAX_SAFE_INTEGER;

  const tenants = participants
    .flatMap((p) => (p.kind === "lease" ? [p] : []))
    .sort((x, y) => rankOf(x.key) - rankOf(y.key) || x.order - y.order);

  for (const tenant of tenants) {
    const tenantLine = byKey.get(tenant.key);
    if (!tenantLine) continue;
    let shortfall = tenantLine.claimed - tenantLine.paid;
    if (shortfall <= 0) continue;
    const tenantDate = leaseBaseDate(tenant.claim);

    // 임차인보다 법정기일이 늦은 당해세 (같은 날은 해당하지 않는다)
    const dangHaeSe = participants
      .flatMap((p) =>
        p.kind === "tax" && p.item.isDangHaeSe === true && p.item.legalDueDate !== null && compareDates(p.item.legalDueDate, tenantDate) > 0
          ? [p]
          : [],
      )
      .sort((x, y) => rankOf(x.key) - rankOf(y.key) || x.order - y.order);

    for (const item of dangHaeSe) {
      if (shortfall <= 0) break;
      const itemLine = byKey.get(item.key);
      if (!itemLine) continue;
      const amount = Math.min(shortfall, itemLine.paid);
      if (amount <= 0) continue;

      itemLine.paid -= amount;
      tenantLine.paid += amount;
      shortfall -= amount;

      const law = item.claim.taxType === "local" ? "지방세기본법 제71조 제6항" : "국세기본법 제35조 제7항";
      transfers.push({ fromKey: item.key, fromLabel: item.label, toKey: tenant.key, toLabel: tenant.label, amount, law });
      itemLine.notes.push(`규칙 5: 우선징수액 중 ${formatWon(amount)}를 ${tenant.label}에게 대신 변제했습니다. (${law})`);
      tenantLine.notes.push(`규칙 5: ${item.label}의 우선징수액 중 ${formatWon(amount)}를 대신 변제받았습니다. (${law}) ${NOTE_SCOPE}`);
    }
  }

  return { lines: lines.map((line) => byKey.get(line.key) ?? line), transfers };
}
