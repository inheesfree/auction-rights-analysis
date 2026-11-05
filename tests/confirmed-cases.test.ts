// PRD 성공 기준: 담당자가 확인한 정답 사례의 배분액이 모두 일치해야 한다.
// 사례 자료는 tests/cases/confirmed.ts에 있다. 새 사례가 확정되면 그 파일에 추가한다.

import assert from "node:assert/strict";
import { describe, expect, test } from "vitest";
import { distribute } from "../lib/distribute";
import { validateClaims } from "../lib/validate";
import { CONFIRMED_CASES } from "./cases/confirmed";

describe("담당자 확인 사례", () => {
  for (const sample of CONFIRMED_CASES) {
    test(sample.name, () => {
      const claims = sample.items.map((item) => item.claim);

      // 표의 값은 입력값 검사를 그대로 통과해야 한다.
      expect(validateClaims(claims).canCalculate).toBe(true);

      const result = distribute(sample.saleProceeds, claims);
      assert.equal(result.ok, true, result.ok ? "" : result.messages.join(" / "));
      if (!result.ok) return;

      // 채권자별 배분액이 담당자 정답과 같다.
      const actual = sample.items.map((item) => [item.who, result.paidByClaim[item.claim.id] ?? 0]);
      const expected = sample.items.map((item) => [item.who, item.paid]);
      expect(actual).toEqual(expected);

      // 남은 금액과 합계 검증
      expect(result.leftover).toBe(sample.leftover);
      const paidTotal = Object.values(result.paidByClaim).reduce((sum, value) => sum + value, 0);
      expect(paidTotal + result.leftover).toBe(sample.saleProceeds);
    });
  }

  test("확정된 사례가 4건 이상이다", () => {
    expect(CONFIRMED_CASES.length).toBeGreaterThanOrEqual(4);
  });
});
