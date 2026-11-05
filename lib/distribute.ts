// Design Ref: §3 ⑤⑥ — 순위 판단 → 금액 계산 (합계 = 매각대금 검증)
// Plan SC: 작업 8 — 순위대로 배분하는 기본 계산과 합계 검증
//
// 계산 순서
//   ① 체납처분비 → 소액임차 최우선변제·최종 3개월 임금채권 (lib/superPriority.ts)
//   ② 나머지 채권을 덩어리(조세는 세목 하나)로 나누고, 모든 쌍의 순위를 규칙(lib/rules)으로 판단한다.
//   ③ 순위 판단으로 "앞 → 뒤" 관계 그래프를 만들고, 같은 순위(동순위)는 한 묶음으로 본다.
//   ④ 앞선 묶음부터 남은 금액을 배분한다. 한 단계의 채권액이 남은 금액보다 많으면 채권액에 비례해 안분한다.
//   ⑤ 규칙 5: 임차인이 당해세보다 먼저 우선변제권을 갖췄으면, 당해세 우선으로 배분한 뒤
//      임차인이 당해세의 우선징수액 범위에서 대신 변제받는다 (lib/rule5.ts).
//   ⑥ 배분액의 합계가 매각대금과 같은지 검증한다. 다르면 결과를 내지 않고 오류로 처리한다.
//
// 이 단계에서는 계산하지 않고 이유를 알리는 경우 (틀린 숫자를 내지 않기 위해)
//   - 담당자 기준이 없는 판단(undetermined), 순위 규칙이 없는 쌍
//   - 공과금·임차보증금·조세가 한 건씩 얽힌 경우를 뺀 나머지 순환 (그 순환은 lib/circular.ts로 계산한다)
//   - 주택 전세권 (순위 규칙이 정해지지 않음), 소액임차 기준표가 없는 지역·시기

import { claimLabel } from "./claimLabel";
import {
  absorbCycle,
  describeSupportedCycle,
  findStronglyConnected,
  type CircularAllocation,
  type CycleMember,
} from "./circular";
import { assertWon, formatWon, sumWon } from "./money";
import { prorate } from "./prorate";
import { applyRule5, type Rule5Transfer } from "./rule5";
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
      /** 규칙 5에 따라 당해세에서 임차인에게 옮긴 금액. 없으면 빈 목록. */
      rule5Transfers: Rule5Transfer[];
      /** 순환 배분(공과금·임차보증금·조세) 계산 내역. 순환이 없으면 빈 목록. */
      circular: CircularAllocation[];
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

  // ④ 순위가 서로 엇갈리는 묶음(순환)을 찾는다.
  //    공과금·임차보증금·조세가 한 건씩 한 바퀴 도는 순환만 계산하고(lib/circular.ts),
  //    그 밖의 순환은 계산하지 않고 이유를 알린다.
  const roots = [...new Set(participants.map((_, index) => find(index)))];
  const adjacency = new Map<number, number[]>(roots.map((r) => [r, []]));
  for (const edge of edges) {
    const [u, v] = edge.split(">").map(Number);
    adjacency.get(u)!.push(v);
  }
  const components = findStronglyConnected(roots, adjacency);
  const unitOf = new Map<number, number>();
  components.forEach((component, id) => component.forEach((root) => unitOf.set(root, id)));
  const participantsOfUnit = (id: number): { index: number; participant: Participant }[] =>
    participants.flatMap((participant, index) => (unitOf.get(find(index)) === id ? [{ index, participant }] : []));

  const cycleOfUnit = new Map<number, CycleMember[]>();
  const unsupportedCycles: string[] = [];
  components.forEach((component, id) => {
    if (component.length < 2) return;
    const members = participantsOfUnit(id);
    const described = component.length === 3 ? describeSupportedCycle(members, before) : null;
    if (described) cycleOfUnit.set(id, described);
    else unsupportedCycles.push(members.map((m) => m.participant.label).join(", "));
  });
  if (unsupportedCycles.length > 0) {
    return {
      ok: false,
      reason: "cycle",
      messages: unsupportedCycles.map(
        (names) =>
          `순위가 서로 엇갈려(순환) 한 줄로 정할 수 없습니다: ${names}. 이 앱은 공과금·임차보증금·조세가 한 건씩 얽힌 순환만 계산하며, 그 밖의 순환은 "이 앱이 다루지 않는 경우"입니다.`,
      ),
      judgments,
    };
  }

  // 순환 묶음을 한 덩어리로 보고, 앞서는 묶음이 없는 묶음들을 한 단계로 묶어 단계(rank)를 매긴다.
  const unitEdges = new Set<string>();
  for (const edge of edges) {
    const [u, v] = edge.split(">").map(Number);
    const from = unitOf.get(u)!;
    const to = unitOf.get(v)!;
    if (from !== to) unitEdges.add(`${from}>${to}`);
  }
  const indegree = new Map<number, number>(components.map((_, id) => [id, 0]));
  const next = new Map<number, number[]>(components.map((_, id) => [id, []]));
  for (const edge of unitEdges) {
    const [from, to] = edge.split(">").map(Number);
    next.get(from)!.push(to);
    indegree.set(to, indegree.get(to)! + 1);
  }
  const levels: number[][] = [];
  let frontier = components.map((_, id) => id).filter((id) => indegree.get(id) === 0);
  while (frontier.length > 0) {
    levels.push(frontier);
    const upcoming: number[] = [];
    for (const from of frontier) {
      for (const to of next.get(from)!) {
        indegree.set(to, indegree.get(to)! - 1);
        if (indegree.get(to) === 0) upcoming.push(to);
      }
    }
    frontier = upcoming;
  }

  // ⑤ 단계별 배분
  let remaining = superResult.remaining;
  const lines: DistributionLine[] = [];
  const circular: CircularAllocation[] = [];
  const participantByKey = new Map(participants.map((p) => [p.key, p]));
  type Slot =
    | { kind: "single"; order: number; participant: Participant }
    | { kind: "cycle"; order: number; members: CycleMember[] };

  levels.forEach((levelUnits, levelIndex) => {
    // 한 단계에 들어가는 덩어리: 순환 묶음은 한 덩어리, 나머지는 채권(세목) 하나가 한 덩어리
    const slots: Slot[] = [];
    for (const id of levelUnits) {
      const members = participantsOfUnit(id).map((m) => m.participant);
      const cycle = cycleOfUnit.get(id);
      if (cycle) slots.push({ kind: "cycle", order: Math.min(...members.map((m) => m.order)), members: cycle });
      else for (const participant of members) slots.push({ kind: "single", order: participant.order, participant });
    }
    slots.sort((x, y) => x.order - y.order);

    const claimedAmounts = slots.map((slot) =>
      slot.kind === "single" ? slot.participant.amount : sumWon(slot.members.map((m) => m.amount)),
    );
    const total = sumWon(claimedAmounts);
    const shortage = total > remaining;
    const allotted = shortage ? prorate(remaining, claimedAmounts).shares : claimedAmounts;

    const levelLines: { order: number; line: DistributionLine }[] = [];
    slots.forEach((slot, slotIndex) => {
      if (slot.kind === "single") {
        const member = slot.participant;
        const notes: string[] = [];
        if (slots.length > 1) notes.push("같은 순위(동순위)로 묶여 있습니다.");
        if (shortage && slots.length > 1) notes.push("남은 금액이 모자라 채권액에 비례해 안분했습니다. (안분 방식은 임시 규칙, 확인 필요)");
        if (shortage && slots.length === 1) notes.push("남은 금액이 모자라 일부만 배분했습니다.");
        levelLines.push({
          order: member.order,
          line: {
            key: member.key,
            claimId: member.claimId,
            label: member.label,
            kind: member.kind,
            rank: levelIndex + 1,
            claimed: member.amount,
            paid: allotted[slotIndex],
            notes,
          },
        });
        return;
      }
      // 순환 배분: 1차 안분 후 한 번만 흡수 (재흡수 없음)
      const { finals, detail } = absorbCycle(allotted[slotIndex], slot.members);
      circular.push(detail);
      slot.members.forEach((cycleMember, j) => {
        const member = participantByKey.get(cycleMember.key)!;
        const d = detail.members[j];
        const notes = detail.shortage
          ? [
              `순환 배분(공과금·임차보증금·조세): 1차 안분 ${formatWon(d.first)} → 흡수 +${formatWon(d.absorbed)}(${d.absorbsFrom}), 빼앗김 −${formatWon(d.lost)} → ${formatWon(d.final)}`,
              "1차 안분 후 한 번만 흡수하고 재흡수는 하지 않습니다. (담당자 확인 방식, 1원 단위 나머지는 임시 규칙)",
            ]
          : ["순위가 서로 엇갈리지만 배분재원이 충분해 순환 영향 없이 전액 배분했습니다."];
        levelLines.push({
          order: member.order,
          line: {
            key: member.key,
            claimId: member.claimId,
            label: member.label,
            kind: member.kind,
            rank: levelIndex + 1,
            claimed: member.amount,
            paid: finals[j],
            notes,
          },
        });
      });
    });
    lines.push(...levelLines.sort((x, y) => x.order - y.order).map((entry) => entry.line));
    remaining -= sumWon(allotted);
  });

  // ⑥ 규칙 5: 당해세 우선으로 먼저 배분한 뒤, 임차인이 당해세의 우선징수액 범위에서 대신 변제받는다.
  const adjusted = applyRule5(participants, lines);
  const finalLines = adjusted.lines;

  // ⑦ 합계 검증: 배분액의 합계 + 남은 금액 = 매각대금
  const paidTotal = sumWon([...superResult.lines.map((l) => l.paid), ...finalLines.map((l) => l.paid)]);
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
  for (const line of finalLines) paidByClaim[line.claimId] = (paidByClaim[line.claimId] ?? 0) + line.paid;

  return {
    ok: true,
    saleProceeds,
    superPriority: superResult.lines,
    lines: finalLines,
    excluded,
    rule5Transfers: adjusted.transfers,
    circular,
    judgments,
    leftover: remaining,
    paidByClaim,
  };
}
