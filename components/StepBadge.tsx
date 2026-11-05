// 구역 제목 앞의 「STEP 1」 표시 (둥근 사각형). 스타일은 globals.css의 `.step-badge`.

export default function StepBadge({ n }: { n: number }) {
  return (
    <span className="step-badge" aria-label={`단계 ${n}`}>
      <span aria-hidden="true">STEP</span>
      <b aria-hidden="true">{n}</b>
    </span>
  );
}
