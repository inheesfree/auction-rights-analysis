// Design Ref: §3 ⑤ — 순환 배분 (판단규칙_초안.md "순환 배분 유형 1: 공과금·임차보증금·조세")
// Plan SC: 작업 11 — 순위가 서로 엇갈릴 때(1차 안분 후 한 번만 흡수, 재흡수 없음) 계산한다
//
// 담당자 확인 내용 (2026-11-04)
//   - 공과금·임차보증금·조세가 한 건씩 얽혀 순위가 한 바퀴 도는 경우(공과금 > 임차보증금 > 조세 > 공과금)만 계산한다.
//     그 밖의 순환은 계산하지 않고 "이 앱이 다루지 않는 경우"로 안내한다.
//   - 1차 안분액 = 배분재원 × 개별채권액 ÷ 총채권액, 부족액 = 채권액 − 1차 안분액
//   - 각 채권자는 자기보다 후순위인 채권자의 1차 안분액에서 자기 부족액 한도로 흡수한다.
//     흡수는 모두 1차 안분액을 기준으로 동시에 한 번만 하며, 흡수한 금액을 다시 흡수하지 않는다.
//   - 최종 배분액 = 1차 안분액 + 흡수한 금액 − 빼앗긴 금액
// [확인 필요] 1차 안분의 1원 단위 나머지는 lib/prorate.ts의 임시 규칙을 따른다.

import { prorate } from "./prorate";
import type { Participant } from "./rules";
import type { Won } from "./types";

/** 순환에 걸린 채권 한 건. */
export interface CycleMember {
  key: string;
  label: string;
  /** 이 순위 단계에서 받으려는 금액. */
  amount: Won;
  /** 자기보다 후순위인(자기가 앞서는) 채권의 위치. 이 채권의 1차 안분액을 흡수한다. */
  beatsIndex: number;
}

/** 순환 배분 계산 내역 (화면에서 근거로 보여준다). */
export interface CircularAllocation {
  /** 순환에 걸린 채권들에게 배분하는 금액. */
  pool: Won;
  /** 배분재원이 모자라 실제로 안분·흡수를 했는지. 충분하면 `false`(전액 배분). */
  shortage: boolean;
  members: {
    key: string;
    label: string;
    claimed: Won;
    /** 1차 안분액. */
    first: Won;
    /** 흡수한 금액. */
    absorbed: Won;
    /** 다른 채권자에게 빼앗긴 금액. */
    lost: Won;
    /** 최종 배분액. */
    final: Won;
    /** 자기보다 후순위여서 안분액을 흡수한 채권의 이름. */
    absorbsFrom: string;
  }[];
}

/**
 * 순환에 걸린 세 채권에 `pool`원을 배분한다.
 * 배분재원이 채권액 합계 이상이면 순환 영향 없이 전액 배분한다.
 */
export function absorbCycle(pool: Won, members: readonly CycleMember[]): { finals: Won[]; detail: CircularAllocation } {
  const amounts = members.map((m) => m.amount);
  const total = amounts.reduce((a, b) => a + b, 0);
  const shortage = pool < total;

  const first = shortage ? prorate(pool, amounts).shares : [...amounts];
  const deficit = members.map((m, i) => m.amount - first[i]);
  // 모든 흡수는 1차 안분액을 기준으로 동시에 한 번만 계산한다.
  const absorbed = members.map((m, i) => Math.min(deficit[i], first[m.beatsIndex]));
  const lost = members.map((_, i) => {
    const absorber = members.findIndex((m) => m.beatsIndex === i);
    return absorber === -1 ? 0 : absorbed[absorber];
  });
  const finals = members.map((_, i) => first[i] + absorbed[i] - lost[i]);

  return {
    finals,
    detail: {
      pool,
      shortage,
      members: members.map((m, i) => ({
        key: m.key,
        label: m.label,
        claimed: m.amount,
        first: first[i],
        absorbed: absorbed[i],
        lost: lost[i],
        final: finals[i],
        absorbsFrom: members[m.beatsIndex].label,
      })),
    },
  };
}

/**
 * 순위 판단으로 얽힌 한 묶음이 "공과금·임차보증금·조세가 한 건씩 한 바퀴 도는 순환"인지 확인한다.
 * 맞으면 순환 계산에 쓸 정보를 돌려주고, 아니면 `null`(이 앱이 다루지 않는 순환)이다.
 * @param members 묶음에 속한 참가자와 그 위치 번호
 * @param before  순위 판단 결과: [앞선 쪽 위치, 뒤선 쪽 위치]
 */
export function describeSupportedCycle(
  members: readonly { index: number; participant: Participant }[],
  before: readonly (readonly [number, number])[],
): CycleMember[] | null {
  if (members.length !== 3) return null;
  const kinds = members.map((m) => m.participant.kind).sort();
  if (kinds.join(",") !== ["charge", "lease", "tax"].sort().join(",")) return null;

  const sorted = [...members].sort((a, b) => a.participant.order - b.participant.order);
  const indexes = new Set(sorted.map((m) => m.index));
  const beats: number[] = [];
  for (const m of sorted) {
    // 묶음 안에서 이 채권이 앞서는 상대는 정확히 한 건이어야 한다 (한 바퀴 도는 순환).
    const targets = before.filter(([from, to]) => from === m.index && indexes.has(to)).map(([, to]) => to);
    if (targets.length !== 1) return null;
    beats.push(sorted.findIndex((other) => other.index === targets[0]));
  }
  if (new Set(beats).size !== 3 || beats.some((b, i) => b === i)) return null;

  return sorted.map((m, i) => ({
    key: m.participant.key,
    label: m.participant.label,
    amount: m.participant.amount,
    beatsIndex: beats[i],
  }));
}

/**
 * 방향 그래프에서 서로 오갈 수 있는 묶음(강연결 요소)을 모두 찾는다. 순환이 없는 점도 혼자 한 요소가 된다.
 */
export function findStronglyConnected(nodes: readonly number[], adjacency: ReadonlyMap<number, readonly number[]>): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const result: number[][] = [];
  let counter = 0;

  const visit = (v: number): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      result.push(component);
    }
  };

  for (const v of nodes) if (!index.has(v)) visit(v);
  return result;
}
