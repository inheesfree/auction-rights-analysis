// 이름 마스킹과 주민등록번호처럼 보이는 값 가리기 (담당자 확인: 이름은 마스킹해서 보여준다)

import { expect, test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { isOrganizationName, maskClaim, maskName, maskResidentNumbers } from "../lib/privacy";

test("사람 이름은 첫 글자만 남기고 가린다", () => {
  expect(maskName("노정식")).toBe("노○○");
  expect(maskName("홍길동")).toBe("홍○○");
  expect(maskName("이영")).toBe("이○");
  expect(maskName("남궁민수")).toBe("남○○○");
  expect(maskName("김")).toBe("김");
  expect(maskName("")).toBe("");
});

test("이미 가려진 이름은 그대로, 앞뒤 공백은 정리", () => {
  expect(maskName("홍○○")).toBe("홍○○");
  expect(maskName("  노정식 ")).toBe("노○○");
});

test("기관 이름(세무서·구청·공단·은행·조합 등)은 가리지 않는다", () => {
  for (const name of ["동울산세무서", "울산북구청", "국민건강보험공단 울산중부지사", "한국자산관리공사", "농소농업협동조합", "○○은행", "(주)가나다"]) {
    expect(isOrganizationName(name)).toBe(true);
    expect(maskName(name)).toBe(name.trim());
  }
  expect(isOrganizationName("노정식")).toBe(false);
});

test("채권 이름만 바꾸고 나머지 값은 그대로", () => {
  const claim = buildClaim("m1", "lease", { creditor: "노정식", amount: "120000000", moveInDate: "2025-01-22", fixedDate: "2025-01-23", isHousing: "yes", region: "seoul" }, [], false).claim;
  const masked = maskClaim(claim);
  expect(masked.creditor).toBe("노○○");
  expect(masked).toMatchObject({ id: "m1", kind: "lease", amount: 120_000_000 });
  expect(claim.creditor).toBe("노정식"); // 원본은 바뀌지 않는다
});

test("주민등록번호처럼 보이는 값은 가린다", () => {
  expect(maskResidentNumbers("홍길동 900101-1234567 입니다")).toBe("홍길동 ******-******* 입니다");
  expect(maskResidentNumbers("9001011234567")).toBe("******-*******");
  expect(maskResidentNumbers("금액 120,000,000원, 사건 2026-17439-001")).toBe("금액 120,000,000원, 사건 2026-17439-001");
});
