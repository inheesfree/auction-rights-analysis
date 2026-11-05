// Design Ref: §3.1 순위 판단(Judgment), §4 lib/evidence.ts — 순위 판단과 배분의 근거를 사람이 읽는 글로 만든다
// Plan SC: 작업 12 — 모든 순위 판단에 근거(비교한 기준일, 적용한 규칙, 해당 법령)를 함께 보여준다
//
// 계산 결과(lib/distribute.ts)를 받아 화면(작업 13)과 엑셀·문서 출력(작업 21)이 같은 글을 쓰도록 한 곳에서 만든다.
// 숫자는 계산 결과에서 그대로 가져오고 여기서 다시 계산하지 않는다(화면과 출력 파일의 숫자가 같도록).

import type { DistributionLine, DistributionResult } from "./distribute";
import { formatWon, sumWon } from "./money";
import type { Judgment } from "./rules";

type OkResult = Extract<DistributionResult, { ok: true }>;

/** 순위 판단 하나의 근거. */
export interface JudgmentEvidence {
  /** 예: "규칙 6 · 근저당권 vs 임차보증금". 규칙 번호가 없는 기본 원칙은 이름만 쓴다. */
  heading: string;
  /** 비교한 두 채권. 예: "근저당권(A은행) ↔ 주택임차보증금(B)" */
  pair: string;
  /** 결과. 예: "먼저 배분: 근저당권(A은행)", "동순위(채권액에 비례해 안분)" */
  outcome: string;
  /** 비교한 기준일. */
  comparedDates: string[];
  /** 적용한 법령 조문. 없으면 `null`. */
  law: string | null;
  /** 판단 이유. */
  reason: string;
  /** 법적 근거를 확인하지 못한 담당자 업무 기준인지. */
  legalBasisUnverified: boolean;
}

/** 배분 단계 안의 한 줄. */
export interface EvidenceItem {
  text: string;
  /** 줄 아래에 덧붙이는 설명. */
  notes: string[];
}

/** 배분 과정의 한 단계. 예: "1순위", "규칙 5 조정" */
export interface EvidenceStep {
  title: string;
  items: EvidenceItem[];
}

export interface Evidence {
  /** 배분 과정을 단계 순서대로 설명한 것. */
  steps: EvidenceStep[];
  /** 모든 순위 판단의 근거. */
  judgments: JudgmentEvidence[];
  /** 법적 근거를 확인하지 못한 판단의 수. */
  unverifiedCount: number;
  /** 결과와 함께 항상 보여줄 안내. */
  notices: string[];
  /** 합계 검증 문구. 예: "합계 검증: … = 매각대금 …" */
  verification: string;
}

/** 순위 판단 하나를 근거 글로 바꾼다. */
export function describeJudgment(judgment: Judgment): JudgmentEvidence {
  const outcomes: Record<Judgment["winner"], string> = {
    a: `먼저 배분: ${judgment.a.label}`,
    b: `먼저 배분: ${judgment.b.label}`,
    equal: "동순위 (채권액에 비례해 안분)",
    undetermined: "판단하지 않음 (담당자 기준 없음)",
  };
  return {
    heading: judgment.ruleNo === null ? judgment.ruleName : `규칙 ${judgment.ruleNo} · ${judgment.ruleName}`,
    pair: `${judgment.a.label} ↔ ${judgment.b.label}`,
    outcome: outcomes[judgment.winner],
    comparedDates: judgment.comparedDates,
    law: judgment.law,
    reason: judgment.reason,
    legalBasisUnverified: judgment.legalBasisUnverified,
  };
}

function lineText(label: string, claimed: number, paid: number): string {
  return `${label}: 청구 ${formatWon(claimed)} → 배분 ${formatWon(paid)}`;
}

/** 순위 단계(rank)별로 줄을 묶는다. */
function groupByRank(lines: readonly DistributionLine[]): Map<number, DistributionLine[]> {
  const groups = new Map<number, DistributionLine[]>();
  for (const line of lines) groups.set(line.rank, [...(groups.get(line.rank) ?? []), line]);
  return groups;
}

/**
 * 배분 결과의 근거를 만든다.
 * 계산에 성공한 결과만 받는다. 계산하지 않은 이유는 결과의 `messages`를 그대로 보여준다.
 */
export function buildEvidence(result: OkResult): Evidence {
  const steps: EvidenceStep[] = [];

  if (result.superPriority.length > 0) {
    steps.push({
      title: "먼저 배분 (체납처분비 → 소액임차 최우선변제·최종 3개월분 임금채권)",
      items: result.superPriority.map((line) => ({
        text: lineText(line.label, line.entitled, line.paid),
        notes: line.notes,
      })),
    });
  }

  for (const [rank, lines] of groupByRank(result.lines)) {
    steps.push({
      title: `${rank}순위`,
      items: lines.map((line) => ({ text: lineText(line.label, line.claimed, line.paid), notes: line.notes })),
    });
  }

  if (result.rule5Transfers.length > 0) {
    steps.push({
      title: "규칙 5 조정 (당해세 → 주택임차보증금 대신 변제)",
      items: result.rule5Transfers.map((t) => ({
        text: `${t.fromLabel} → ${t.toLabel}: ${formatWon(t.amount)}`,
        notes: [`적용 조문: ${t.law}`],
      })),
    });
  }

  if (result.circular.length > 0) {
    steps.push({
      title: "순환 배분 (공과금·임차보증금·조세, 1차 안분 후 한 번만 흡수)",
      items: result.circular.flatMap((c) => [
        {
          text: `순환에 걸린 채권에 배분한 금액: ${formatWon(c.pool)}${c.shortage ? "" : " (배분재원이 충분해 전액 배분)"}`,
          notes: [],
        },
        ...c.members.map((m) => ({
          text: `${m.label}: 청구 ${formatWon(m.claimed)}, 1차 안분 ${formatWon(m.first)}, 흡수 +${formatWon(m.absorbed)}, 빼앗김 −${formatWon(m.lost)} → ${formatWon(m.final)}`,
          notes: c.shortage ? [`${m.absorbsFrom}의 1차 안분액에서 부족액 한도로 흡수`] : [],
        })),
      ]),
    });
  }

  if (result.excluded.length > 0) {
    steps.push({
      title: "순위 단계에서 배분하지 않은 채권",
      items: result.excluded.map((e) => ({ text: e.label, notes: [e.reason] })),
    });
  }

  const judgments = result.judgments.map(describeJudgment);
  const unverifiedCount = judgments.filter((j) => j.legalBasisUnverified).length;

  const superPaid = sumWon(result.superPriority.map((l) => l.paid));
  const rankPaid = sumWon(result.lines.map((l) => l.paid));
  const verification = `합계 검증: 먼저 배분 ${formatWon(superPaid)} + 순위 배분 ${formatWon(rankPaid)} + 남은 금액 ${formatWon(result.leftover)} = ${formatWon(superPaid + rankPaid + result.leftover)} (매각대금 ${formatWon(result.saleProceeds)})`;

  const notices = ["참고용이며 법적 효력이 없습니다."];
  if (unverifiedCount > 0) {
    notices.push(`순위 판단 ${unverifiedCount}건은 법적 근거를 확인하지 못한 담당자 업무 기준을 적용했습니다.`);
  }
  const usedProration = [...result.superPriority, ...result.lines].some((l) => l.notes.some((n) => n.includes("안분")));
  if (usedProration || result.circular.some((c) => c.shortage)) {
    notices.push("안분할 때 생기는 1원 단위 나머지는 임시 규칙으로 처리했습니다. (담당자 확인 필요)");
  }
  if (result.rule5Transfers.length > 0) {
    notices.push("규칙 5는 국세 2023.4.1. 이후 매각결정 사건에 적용됩니다. 이 앱은 매각결정 시점을 확인하지 않습니다.");
  }

  return { steps, judgments, unverifiedCount, notices, verification };
}

/** 근거 전체를 글 한 덩어리로 바꾼다. (복사하거나 문서·엑셀로 내보낼 때 쓴다.) */
export function evidenceToText(evidence: Evidence): string {
  const out: string[] = [];
  out.push("[배분 과정]");
  for (const step of evidence.steps) {
    out.push(`■ ${step.title}`);
    for (const item of step.items) {
      out.push(`- ${item.text}`);
      for (const note of item.notes) out.push(`    · ${note}`);
    }
  }
  out.push("", "[순위 판단 근거]");
  evidence.judgments.forEach((j, index) => {
    out.push(`${index + 1}. ${j.heading}${j.legalBasisUnverified ? " (법적 근거 미확인)" : ""}`);
    out.push(`   비교 대상: ${j.pair}`);
    for (const d of j.comparedDates) out.push(`   비교한 기준일: ${d}`);
    out.push(`   결과: ${j.outcome}`);
    if (j.law) out.push(`   적용 법령: ${j.law}`);
    out.push(`   이유: ${j.reason}`);
  });
  out.push("", evidence.verification, "", ...evidence.notices.map((n) => `※ ${n}`));
  return out.join("\n");
}
