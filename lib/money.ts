// Design Ref: §5.3 — 금액은 원 단위 정수로만 다룬다 (소수점 계산 금지)
// Plan SC: 작업 2 — 배분액 합계가 매각대금과 1원도 어긋나지 않으려면 모든 금액이 정수여야 한다
//
// 이 파일에는 안분(비율 나누기)을 넣지 않는다.
// 안분할 때 생기는 1원 단위 나머지 처리 방식을 담당자와 정한 뒤(PLAN 선행 조건) 작업 8에서 만든다.

import type { Won } from "./types";

/** 0원 이상의 안전한 정수인지 확인한다. 소수, 음수, 너무 큰 수, NaN은 금액이 아니다. */
export function isWon(value: unknown): value is Won {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

/**
 * 사람이 입력한 금액 글자를 원 단위 정수로 바꾼다.
 * - 쉼표, 앞뒤 공백, 끝의 "원"은 무시한다. 예: "1,000,000원" → 1000000
 * - 숫자 이외의 글자나 소수점이 있으면 추측하지 않고 `null`(빈칸)을 돌려준다.
 */
export function parseWon(text: string): Won | null {
  const cleaned = text.trim().replace(/원$/, "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return isWon(value) ? value : null;
}

/** 금액을 화면용 글자로 바꾼다. 예: 25000000 → "25,000,000원" */
export function formatWon(amount: Won): string {
  assertWon(amount);
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 금액 여러 개를 더한다. 하나라도 금액이 아니거나 합이 안전한 정수 범위를 넘으면 오류를 낸다. */
export function sumWon(amounts: readonly Won[]): Won {
  let total = 0;
  for (const amount of amounts) {
    assertWon(amount);
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("금액의 합이 너무 커서 정확하게 계산할 수 없습니다.");
    }
  }
  return total;
}

/** 금액이 아니면 오류를 낸다. 계산 도중 잘못된 값이 조용히 섞이는 것을 막는다. */
export function assertWon(value: unknown): asserts value is Won {
  if (!isWon(value)) {
    throw new RangeError(`금액은 0원 이상의 정수여야 합니다: ${String(value)}`);
  }
}
