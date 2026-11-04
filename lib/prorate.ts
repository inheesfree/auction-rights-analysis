// Design Ref: §5.3 — 금액은 원 단위 정수. 안분(비율 나누기) 도구.
// Plan SC: 작업 7 — 최우선변제 채권이 배분재원보다 많을 때 채권액에 비례해 안분하고, 합계가 1원도 어긋나지 않게 한다.
//
// [확인 필요] 안분할 때 생기는 1원 단위 나머지를 누구에게 줄지는 담당자와 아직 정하지 않았다.
// 지금은 임시로 "내림한 뒤 남은 원을, 소수점 이하 몫이 큰 채권부터 1원씩, 같으면 앞선 채권부터" 나눈다
// (최대잔여법). 담당자가 방식을 정하면 이 파일의 `distributeRemainder`만 바꾸면 된다.

import { assertWon } from "./money";
import type { Won } from "./types";

export interface ProrateResult {
  /** 채권별 안분액. 합계가 `total`과 정확히 같다. */
  shares: Won[];
  /** 내림하고 남아서 임시 규칙으로 나눈 원 수. 0이면 정확히 나누어떨어진 것이다. */
  remainderWon: Won;
}

/**
 * `total`원을 채권액(`weights`)에 비례해 나눈다. 큰 수에서도 정확하도록 BigInt로 계산한다.
 * 채권액의 합이 0이면 모두 0원이다. (호출하는 쪽에서 `total`이 채권액 합보다 작을 때만 쓴다.)
 */
export function prorate(total: Won, weights: readonly Won[]): ProrateResult {
  assertWon(total);
  weights.forEach((w) => assertWon(w));

  // (이 프로젝트는 ES2017 대상이라 `0n` 같은 BigInt 글자 표기 대신 BigInt(0)을 쓴다.)
  const zero = BigInt(0);
  const sum = weights.reduce((acc, w) => acc + BigInt(w), zero);
  if (sum === zero) return { shares: weights.map(() => 0), remainderWon: 0 };

  const t = BigInt(total);
  const floors = weights.map((w) => (t * BigInt(w)) / sum);
  const remainders = weights.map((w) => (t * BigInt(w)) % sum);
  const distributed = floors.reduce((acc, f) => acc + f, zero);
  const leftover = Number(t - distributed);

  const shares = floors.map((f) => Number(f));
  distributeRemainder(shares, remainders, leftover);
  return { shares, remainderWon: leftover };
}

/** [임시 규칙] 나머지 원을 소수점 이하 몫이 큰 채권부터 1원씩 나눈다. 몫이 같으면 앞선 채권이 먼저. */
function distributeRemainder(shares: Won[], remainders: bigint[], leftover: number): void {
  const order = remainders
    .map((r, index) => ({ r, index }))
    .sort((a, b) => (a.r === b.r ? a.index - b.index : a.r > b.r ? -1 : 1));
  for (let i = 0; i < leftover; i++) {
    shares[order[i % order.length].index] += 1;
  }
}
