// 공매재산명세서 권리분석: 금액 없이 순위·근거·인수 대상만 보여준다 (담당자 확인 2026-11-05)

import { expect, test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { analyzeStatement } from "../lib/statement";
import type { Claim, RightKind } from "../lib/types";
import { validateClaims } from "../lib/validate";

let seq = 0;
const claim = (kind: RightKind, values: Record<string, string>, items: Record<string, string>[] = []): Claim =>
  buildClaim(`st${++seq}`, kind, values, items, false).claim;
const tax = (creditor: string, type: "national" | "local", amount: string, legal: string, seizure = ""): Claim =>
  claim("tax", { creditor, amount, taxType: type, hasTaxCollateral: "no", seizureDate: seizure }, [
    { name: "(세목 미기재)", legalDueDate: legal, amount, isDangHaeSe: "no" },
  ]);
const lease = (creditor: string, deposit: string, moveIn: string, fixed: string): Claim =>
  claim("lease", { creditor, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });

function analyze(claims: Claim[]) {
  expect(validateClaims(claims).canCalculate).toBe(true);
  const analysis = analyzeStatement(claims);
  expect(analysis.ok).toBe(true);
  if (!analysis.ok) throw new Error(analysis.messages.join(" / "));
  return analysis;
}

test("울산 명세서 사례: 근저당 > 임차인 > 국세 > 지방세 2곳(동순위) > 공과금, 이름은 가림", () => {
  // 임차인 보증금은 서울 소액 기준을 넘는 2억원으로 두었다 (광역시 소액임차 기준표가 아직 없음).
  const analysis = analyze([
    claim("mortgage", { creditor: "농소농업협동조합", amount: "47261108", registrationDate: "2024-02-16" }),
    lease("노정식", "200000000", "2025-01-22", "2025-01-23"),
    tax("동울산세무서", "national", "46318260", "2025-05-31", "2026-05-26"),
    tax("울산북구청", "local", "2895510", "2025-12-10"),
    tax("울산중구청", "local", "909160", "2025-05-14"),
    claim("publicCharge", { creditor: "국민건강보험공단", amount: "2978400", dueDate: "2026-02-10" }),
  ]);
  expect(analysis.rows.map((row) => [row.stage, row.label.replace(/^.*?\(|\).*$/g, "")])).toEqual([
    ["1순위", "농소농업협동조합"],
    ["2순위", "노○○"],
    ["3순위", "동울산세무서"],
    ["4순위", "울산북구청"],
    ["4순위", "울산중구청"],
    ["5순위", "국민건강보험공단"],
  ]);
  expect(analysis.rows.some((row) => row.label.includes("노정식"))).toBe(false);
  expect(analysis.acquiringTenants).toEqual([{ label: "주택임차보증금(노○○)", deposit: 200_000_000 }]);
  expect(analysis.notices[0]).toContain("매각금액을 모르므로");
  expect(analysis.notices).toContain("참고용이며 법적 효력이 없습니다.");
});

test("사례 5: 소액임차 최우선변제가 먼저 배분 단계에 나오고, 대항력 있는 임차인은 인수 대상", () => {
  const analysis = analyze([
    claim("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }),
    tax("양천세무서", "national", "2000000", "2010-05-05", "2015-02-05"),
    lease("홍길동", "65500000", "2016-10-05", "2016-10-05"),
    tax("관악세무서", "national", "30000000", "2017-10-06", "2018-03-01"),
  ]);
  expect(analysis.rows.map((row) => row.stage)).toEqual(["먼저 배분", "먼저 배분", "1순위", "2순위", "3순위"]);
  expect(analysis.rows[1].label).toContain("홍○○");
  expect(analysis.rows[3].notes.join(" ")).toContain("나머지 보증금");
  expect(analysis.acquiringTenants).toEqual([{ label: "주택임차보증금(홍○○)", deposit: 65_500_000 }]);
});

test("금액 정보는 명세서의 채권액뿐이고 배분액은 담지 않는다", () => {
  const analysis = analyze([claim("mortgage", { creditor: "가나은행", amount: "1000", registrationDate: "2020-01-01" }), tax("○○세무서", "national", "500", "2021-01-01")]);
  for (const row of analysis.rows) expect(Object.keys(row).sort()).toEqual(["claimed", "label", "notes", "stage"]);
  expect(analysis.rows.map((row) => row.claimed)).toEqual([1000, 500]);
  expect(JSON.stringify(analysis)).not.toContain("paid");
});

test("확정일자가 없는 임차인은 인수 대상이 아니고 배분 대상에서 제외 목록에 나온다", () => {
  const analysis = analyze([claim("mortgage", { creditor: "가나은행", amount: "1000", registrationDate: "2020-01-01" }), lease("김철수", "500000000", "2021-01-01", "")]);
  expect(analysis.acquiringTenants).toEqual([]);
  expect(analysis.excluded).toHaveLength(1);
  expect(analysis.excluded[0].label).toContain("김○○");
});

test("순환이 있으면 같은 순위로 묶어 보여주고 안내한다", () => {
  const analysis = analyze([
    claim("publicCharge", { creditor: "건강보험공단", amount: "100", dueDate: "2020-01-01" }),
    lease("홍길동", "500000000", "2021-03-02", "2021-03-10"),
    tax("○○세무서", "national", "300", "2022-01-01"),
  ]);
  expect(analysis.rows.map((row) => row.stage)).toEqual(["1순위", "1순위", "1순위"]);
  expect(analysis.notices.some((text) => text.includes("순환"))).toBe(true);
});

test("규칙이 없거나 기준표가 없으면 분석하지 않고 이유를 알린다", () => {
  const stopped = analyzeStatement([claim("publicCharge", { creditor: "가", amount: "1", dueDate: "2020-01-01" }), claim("publicCharge", { creditor: "나", amount: "1", dueDate: "2020-01-01" })]);
  expect(stopped.ok).toBe(false);
  const unsupportedRegion = analyzeStatement([{ ...lease("노정식", "50000000", "2025-01-22", "2025-01-23"), region: "other" } as Claim]);
  expect(unsupportedRegion.ok).toBe(false);
});
