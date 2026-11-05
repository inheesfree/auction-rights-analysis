/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";
import { buildEvidence, describeJudgment, evidenceToText } from "../lib/evidence";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "200000000") => mk("mortgage", { creditor: "A은행", amount: amt, registrationDate: d });
const lease = (deposit: string, moveIn = "2021-03-02", fixed = "2021-03-10") =>
  mk("lease", { creditor: "B임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });
const dang = (legal: string, amt: string) =>
  mk("tax", { creditor: "C세무서", amount: amt, taxType: "national", hasTaxCollateral: "no" }, [{ name: "종합부동산세", legalDueDate: legal, amount: amt, isDangHaeSe: "yes" }]);
const charge = (amt: string) => mk("publicCharge", { creditor: "건보공단", amount: amt, dueDate: "2020-06-01" });
const tax = (amt: string) => mk("tax", { creditor: "세무서", amount: amt, taxType: "national", hasTaxCollateral: "no" }, [{ name: "소득세", legalDueDate: "2022-01-01", amount: amt, isDangHaeSe: "no" }]);

t("규칙 5 예시: 단계·판단 근거·합계 검증 문구", () => {
  const r = distribute(250_000_000, [mortgage("2020-01-10"), lease("120000000"), dang("2022-11-20", "30000000")]) as any;
  const e = buildEvidence(r);
  assert.ok(e.steps.some((s) => s.title.startsWith("1순위")) && e.steps.some((s) => s.title.includes("규칙 5 조정")));
  assert.equal(e.judgments.length, 3);
  const rule5 = e.judgments.find((j) => j.heading.startsWith("규칙 5"))!;
  assert.ok(rule5.comparedDates.length === 2 && rule5.law!.includes("제35조 제7항") && rule5.outcome.startsWith("먼저 배분"));
  assert.match(e.verification, /= 250,000,000원 \(매각대금 250,000,000원\)/);
  assert.ok(e.notices[0].includes("법적 효력이 없습니다") && e.notices.some((s) => s.includes("2023.4.1.")));
  const text = evidenceToText(e);
  assert.ok(text.includes("[배분 과정]") && text.includes("[순위 판단 근거]") && text.includes("비교한 기준일:") && text.includes("적용 법령:") && text.includes("합계 검증"));
});

t("법적 근거 미확인 표시와 개수: 같은 날 처리 사례", () => {
  const m = mortgage("2021-03-10", "100000000"), l = lease("120000000", "2021-03-09", "2021-03-10"); // 규칙 6 사례 ② (동순위)
  const r = distribute(150_000_000, [m, l]) as any;
  const e = buildEvidence(r);
  const j = e.judgments[0];
  assert.equal(j.legalBasisUnverified, true); assert.ok(j.outcome.startsWith("동순위"));
  assert.equal(e.unverifiedCount, 1); assert.ok(e.notices.some((s) => s.includes("1건")));
  assert.ok(e.notices.some((s) => s.includes("1원 단위"))); // 안분이 있어 임시 규칙 안내
  assert.ok(evidenceToText(e).includes("(법적 근거 미확인)"));
});

t("순환 배분: 순환 단계와 계산 내역(1차 안분·흡수·빼앗김)", () => {
  const r = distribute(360_000_000, [lease("120000000"), charge("240000000"), tax("360000000")]) as any;
  const e = buildEvidence(r);
  const step = e.steps.find((s) => s.title.startsWith("순환 배분"))!;
  assert.equal(step.items.length, 4); assert.ok(step.items[1].text.includes("1차 안분") && step.items[1].text.includes("흡수"));
  assert.ok(e.judgments.every((j) => j.heading && j.pair && j.outcome && j.reason));
});

t("제외된 채권과 규칙 번호 없는 기본 원칙 이름", () => {
  const r = distribute(100_000_000, [mortgage("2020-01-01", "10000000"), mortgage("2020-05-01", "10000000"), lease("500000000", "2021-01-01", "")]) as any;
  const e = buildEvidence(r);
  assert.ok(e.steps.some((s) => s.title.includes("배분하지 않은 채권")));
  assert.ok(e.judgments.some((j) => j.heading === "근저당권 상호간 (등기 순서)"));
  assert.match(e.verification, /남은 금액/);
});

t("판단 하나 변환: 방향(a/b)에 맞는 승자 표시", () => {
  const r = distribute(100, [mortgage("2020-01-01", "50"), mortgage("2020-05-01", "50")]) as any;
  const j = r.judgments[0];
  const d = describeJudgment(j);
  assert.ok(d.outcome.includes(j.winner === "a" ? j.a.label : j.b.label));
});
