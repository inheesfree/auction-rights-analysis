// Design Ref: §3 ⑤⑥ — 순위 판단 → 금액 계산 (합계 = 매각대금 검증)
// Plan SC: 작업 8 — 순위대로 배분하는 기본 계산과 합계 검증
//
// 계산 순서
//   ① 체납처분비 → 소액임차 최우선변제·최종 3개월 임금채권 (lib/superPriority.ts)
//   ② 나머지 채권을 덩어리(조세는 세목 하나)로 나누고, 모든 쌍의 순위를 규칙(lib/rules)으로 판단한다.
//   ③ 순위 판단으로 "앞 → 뒤" 관계 그래프를 만들고, 같은 순위(동순위)는 한 묶음으로 본다.
//   ④ 앞선 묶음부터 남은 금액을 배분한다. 한 단계의 채권액이 남은 금액보다 많으면 채권액에 비례해 안분한다.
//   ⑤ 배분액의 합계가 매각대금과 같은지 검증한다. 다르면 결과를 내지 않고 오류로 처리한다.
//
// 이 단계에서는 계산하지 않고 이유를 알리는 경우 (틀린 숫자를 내지 않기 위해)
//   - 담당자 기준이 없는 판단(undetermined), 순위 규칙이 없는 쌍
//   - 순위가 서로 엇갈리는 순환 (순환 배분은 작업 11)
//   - 당해세보다 먼저 우선변제권을 갖춘 주택임차인 (규칙 5 조정 계산은 작업 10)
//   - 주택 전세권 (순위 규칙이 정해지지 않음), 소액임차 기준표가 없는 지역·시기

import { claimLabel } from "./claimLabel";
import { assertWon, sumWon } from "./money";
import { prorate } from "./prorate";
import { judgePair, type Judgment, type Participant } from "./rules";
import { taxPartLabel } from "./rules/judgment";
import { allocateSuperPriority, type SuperPriorityLine } from "./superPriority";
import type { Claim, Won } from "./types";

/** 순위 단계에서 배분한 한 줄. */
export interface DistributionLine {
  key: string;
  claimId: string;
  label: string;
  kind: Participant["kind"];
  /** 순위 단계 번호 (1부터). 같은 번호는 동순위·같은 단계라서 함께 안분한다. */
  rank: number;
  claimed: Won;
  paid: Won;
  notes: string[];
}

/** 순위 단계에서 배분받지 못해 제외한 채권과 그 이유. */
export interface ExcludedClaim {
  claimId: string;
  label: string;
  reason: string;
}

export type DistributionFailure = "unsupported" | "undetermined" | "cycle" | "mismatch";

export type DistributionResult =
  | {
      ok: true;
      saleProceeds: Won;
      /** 체납처분비·소액임차 최우선변제·최종 3개월 임금채권 단계. */
      superPriority: SuperPriorityLine[];
      /** 순위대로 배분한 단계. */
      lines: DistributionLine[];
      excluded: ExcludedClaim[];
      /** 모든 순위 판단과 근거. */
      judgments: Judgment[];
      /** 모든 채권에 배분하고 남은 금액. */
      leftover: Won;
      /** 채권(청구서) 한 건당 받은 총액. 조세는 세목별 배분액의 합이다. */
      paidByClaim: Record<string, Won>;
    }
  | {
      ok: false;
      reason: DistributionFailure;
      /** 계산하지 않는 이유를 사람이 읽는 글로 적은 것. */
      messages: string[];
      judgments: Judgment[];
    };

/** 입력값 검사를 통과한 채권으로 순위 단계의 덩어리를 만든다. */
function buildParticipants(
  claims: readonly Claim[],
  smallLeasePaid: Record<string, Won>,
  excluded: ExcludedClaim[],
  stops: string[],
): Participant[] {
  const result: Participant[] = [];
  let order = 0;
  for (const claim of claims) {
    const label = claimLabel(claim);
    switch (claim.kind) {
      case "mortgage":
        assertWon(claim.amount);
        result.push({ key: claim.id, claimId: claim.id, label, amount: claim.amount, order: order++, kind: "mortgage", claim });
        break;
      case "lease": {
        assertWon(claim.amount);
        if (claim.fixedDate === null) {
          excluded.push({
            claimId: claim.id,
            label,
            reason: "확정일자가 없어 우선변제권이 없습니다. 소액임차인으로 받은 최우선변제 외에는 배분을 받지 못합니다.",
          });
          break;
        }
        const remaining = claim.amount - (smallLeasePaid[claim.id] ?? 0);
        if (remaining > 0) {
          result.push({ key: claim.id, claimId: claim.id, label, amount: remaining, order: order++, kind: "lease", claim });
        }
        break;
      }
      case "jeonse":
        stops.push(`${label}: 주택 전세권은 다른 권리와의 순위 규칙이 정해지지 않아 계산하지 않습니다.`);
        break;
      case "tax":
        claim.items.forEach((item, index) => {
          assertWon(item.amount);
          result.push({
            key: `${claim.id}#${index}`,
            claimId: claim.id,
            label: taxPartLabel({ claim, item }),
            amount: item.amount,
            order: order++,
            kind: "tax",
            claim,
            item,
          });
        });
        break;
      case "publicCharge":
        assertWon(claim.amount);
        result.push({ key: claim.id, claimId: claim.id, label, amount: claim.amount, order: order++, kind: "charge", claim });
        break;
      case "wage":
        // 최종 3개월분은 앞 단계에서 이미 배분했다. 일반 임금채권만 순위 단계에 참가한다.
        if (claim.wageType === "general") {
          assertWon(claim.amount);
          result.push({ key: claim.id, claimId: claim.id, label, amount: claim.amount, order: order++, kind: "wageGeneral", claim });
        }
        break;
      case "provisionalSeizure":
        assertWon(claim.amount);
        result.push({ key: claim.id, claimId: claim.id, label, amount: claim.amount, order: order++, kind: "provisional", claim });
        break;
      case "dispositionCost":
        break; // 앞 단계에서 배분했다.
      default:
        stops.push(`${label}: 이 앱이 다루지 않는 권리입니다.`);
    }
  }
  return result;
}

/**
 * 매각대금을 채권 순위대로 배분한다.
 * 입력값 검사(lib/validate.ts)를 통과한 채권만 넣는다.
 */
export function distribute(saleProceeds: Won, claims: readonly Claim[]): DistributionResult {
  assertWon(saleProceeds);

  // ① 체납처분비 → 소액임차 최우선변제·최종 3개월 임금채권
  const superResult = allocateSuperPriority(saleProceeds, claims);
  if (!superResult.ok) {
    return { ok: false, reason: "unsupported", messages: superResult.unsupported, judgments: [] };
  }

  // ② 순위 단계의 덩어리
  const excluded: ExcludedClaim[] = [];
  const stops: string[] = [];
  const participants = buildParticipants(claims, superResult.smallLeasePaid, excluded, stops);
  if (stops.length > 0) return { ok: false, reason: "unsupported", messages: stops, judgments: [] };

  // 모든 쌍의 순위 판단
  const judgments: Judgment[] = [];
  const undetermined: string[] = [];
  const noRule: string[] = [];
  /** 앞선 쪽 → 뒤선 쪽 (덩어리 위치 번호) */
  const before: [number, number][] = [];
  /** 동순위로 묶는 쌍 */
  const equal: [number, number][] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const pair = judgePair(participants[i], participants[j]);
      if (pair.type === "sameClaim") continue;
      if (pair.type === "noRule") {
        if (!noRule.includes(pair.reason)) noRule.push(pair.reason);
        continue;
      }
      const judgment = pair.judgment;
      judgments.push(judgment);
      if (judgment.winner === "undetermined") undetermined.push(`${judgment.a.label} ↔ ${judgment.b.label}: ${judgment.reason}`);
      else if (judgment.winner === "a") before.push([i, j]);
      else if (judgment.winner === "b") before.push([j, i]);
      else equal.push([i, j]);
    }
  }
  if (undetermined.length > 0) return { ok: false, reason: "undetermined", messages: undetermined, judgments };
  if (noRule.length > 0) return { ok: false, reason: "unsupported", messages: noRule, judgments };

  // ③ 동순위 묶음 만들기 (같은 순위인 덩어리는 한 묶음)
  const group = participants.map((_, index) => index);
  const find = (x: number): number => (group[x] === x ? x : (group[x] = find(group[x])));
  for (const [a, b] of equal) group[find(a)] = find(b);

  // 묶음 사이의 "앞 → 뒤" 관계. 한 묶음 안에서 앞뒤가 갈리면 순위가 모순이다.
  const edges = new Set<string>();
  const contradictions: string[] = [];
  for (const [first, second] of before) {
    const u = find(first);
    const v = find(second);
    if (u === v) {
      contradictions.push(`${participants[first].label}와(과) ${participants[second].label}은(는) 동순위로 묶였는데 순위 판단은 앞뒤가 갈립니다.`);
    } else {
      edges.add(`${u}>${v}`);
    }
  }
  if (contradictions.length > 0) return { ok: false, reason: "cycle", messages: contradictions, judgments };

  // ④ 앞선 묶음부터 단계(rank)를 매긴다. 앞서는 묶음이 없는 묶음들이 한 단계가 된다.
  const roots = [...new Set(participants.map((_, index) => find(index)))];
  const indegree = new Map<number, number>(roots.map((r) => [r, 0]));
  const next = new Map<number, number[]>(roots.map((r) => [r, []]));
  for (const edge of edges) {
    const [u, v] = edge.split(">").map(Number);
    next.get(u)!.push(v);
    indegree.set(v, (indegree.get(v) ?? 0) + 1);
  }
  const levels: number[][] = [];
  let frontier = roots.filter((r) => indegree.get(r) === 0);
  let placed = 0;
  while (frontier.length > 0) {
    levels.push(frontier);
    placed += frontier.length;
    const upcoming: number[] = [];
    for (const u of frontier) {
      for (const v of next.get(u)!) {
        indegree.set(v, indegree.get(v)! - 1);
        if (indegree.get(v) === 0) upcoming.push(v);
      }
    }
    frontier = upcoming;
  }
  if (placed < roots.length) {
    const stuck = roots.filter((r) => (indegree.get(r) ?? 0) > 0);
    const names = participants.filter((_, index) => stuck.includes(find(index))).map((p) => p.label);
    return {
      ok: false,
      reason: "cycle",
      messages: [`순위가 서로 엇갈려(순환) 한 줄로 정할 수 없습니다: ${names.join(", ")}. 순환 배분 계산은 아직 구현되지 않아 이 앱이 계산하지 않습니다.`],
      judgments,
    };
  }

  // ⑤ 단계별 배분
  let remaining = superResult.remaining;
  const lines: DistributionLine[] = [];
  levels.forEach((levelRoots, levelIndex) => {
    const members = participants
      .filter((p, index) => levelRoots.includes(find(index)))
      .sort((x, y) => x.order - y.order);
    const claimedAmounts = members.map((m) => m.amount);
    const total = sumWon(claimedAmounts);
    const shortage = total > remaining;
    const paidAmounts = shortage ? prorate(remaining, claimedAmounts).shares : claimedAmounts;
    members.forEach((member, index) => {
      const notes: string[] = [];
      if (members.length > 1) notes.push("같은 순위(동순위)로 묶여 있습니다.");
      if (shortage && members.length > 1) notes.push("남은 금액이 모자라 채권액에 비례해 안분했습니다. (안분 방식은 임시 규칙, 확인 필요)");
      if (shortage && members.length === 1) notes.push("남은 금액이 모자라 일부만 배분했습니다.");
      lines.push({
        key: member.key,
        claimId: member.claimId,
        label: member.label,
        kind: member.kind,
        rank: levelIndex + 1,
        claimed: member.amount,
        paid: paidAmounts[index],
        notes,
      });
    });
    remaining -= sumWon(paidAmounts);
  });

  // ⑥ 합계 검증: 배분액의 합계 + 남은 금액 = 매각대금
  const paidTotal = sumWon([...superResult.lines.map((l) => l.paid), ...lines.map((l) => l.paid)]);
  if (paidTotal + remaining !== saleProceeds) {
    return {
      ok: false,
      reason: "mismatch",
      messages: [`배분액의 합계(${paidTotal.toLocaleString("ko-KR")}원)와 남은 금액(${remaining.toLocaleString("ko-KR")}원)의 합이 매각대금(${saleProceeds.toLocaleString("ko-KR")}원)과 다릅니다. 결과를 내지 않습니다.`],
      judgments,
    };
  }

  const paidByClaim: Record<string, Won> = {};
  for (const line of superResult.lines) paidByClaim[line.claimId] = (paidByClaim[line.claimId] ?? 0) + line.paid;
  for (const line of lines) paidByClaim[line.claimId] = (paidByClaim[line.claimId] ?? 0) + line.paid;

  return {
    ok: true,
    saleProceeds,
    superPriority: superResult.lines,
    lines,
    excluded,
    judgments,
    leftover: remaining,
    paidByClaim,
  };
}
