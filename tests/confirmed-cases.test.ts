// PRD 성공 기준: 담당자가 확인한 정답 사례의 배분액이 모두 일치해야 한다.
// 사례 자료는 tests/cases/confirmed.ts에 있다. 새 사례가 확정되면 그 파일에 추가한다.
// 담당자가 확인하지 않은 값(`null`)은 비교하지 않는다.

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

      // 채권자별 배분액이 담당자 정답과 같다 (확인된 값만 비교).
      const checked = sample.items.filter((item) => item.paid !== null);
      const actual = checked.map((item) => [item.who, result.paidByClaim[item.claim.id] ?? 0]);
      const expected = checked.map((item) => [item.who, item.paid]);
      expect(actual).toEqual(expected);

      // 합계 검증: 배분액의 합계 + 남은 금액 = 매각대금
      const paidTotal = Object.values(result.paidByClaim).reduce((sum, value) => sum + value, 0);
      expect(paidTotal + result.leftover).toBe(sample.saleProceeds);
      if (sample.leftover !== null) expect(result.leftover).toBe(sample.leftover);

      // 매수인이 인수할 임차보증금 (확인된 사례만)
      if (sample.acquired) {
        const actualAcquired = sample.acquired.map((entry) => {
          const item = sample.items.find((candidate) => candidate.who === entry.who)!;
          const found = result.acquiredDeposits.find((d) => d.claimId === item.claim.id);
          return [entry.who, found?.acquired ?? null];
        });
        expect(actualAcquired).toEqual(sample.acquired.map((entry) => [entry.who, entry.amount]));
      }
    });
  }

  test("확정된 사례가 5건 이상이다", () => {
    expect(CONFIRMED_CASES.length).toBeGreaterThanOrEqual(5);
  });
});
