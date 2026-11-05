import type { Metadata } from "next";
import ClaimEditor from "@/components/ClaimEditor";
import PageShell from "@/components/PageShell";

export const metadata: Metadata = {
  title: "담당자용 권리분석",
};

export default function OfficerPage() {
  return (
    <PageShell
      current="/officer"
      title="담당자용 권리분석"
      lead="채권자 정보를 직접 입력하고, 매각대금을 넣어 권리 순위 분석과 배분 결과, 그 근거를 확인합니다."
      notice="참고용이며 법적 효력이 없습니다. 이번 시험에서는 실제 업무 자료를 넣지 말고 가상 데이터만 입력하세요."
    >
      <ClaimEditor />
    </PageShell>
  );
}
