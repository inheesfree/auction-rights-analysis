"use client";

// Design Ref: §2.2 ②③ — 직접 입력한 채권을 모아 확인 표로 보여준다.
// Plan SC: 작업 3 — 입력 → 확인 표. 입력값 검사와 계산은 이후 작업(4~)에서 붙인다.

import { useCallback, useRef, useState } from "react";
import StepBadge from "@/components/StepBadge";
import ClaimForm from "@/components/ClaimForm";
import OcrImageReader from "@/components/OcrImageReader";
import type { OcrParseResult } from "@/lib/ocrParse";
import ClaimTable from "@/components/ClaimTable";
import { buildClaim, type FormValues } from "@/lib/claimForm";
import DistributionSection from "@/components/DistributionSection";
import ValidationPanel from "@/components/ValidationPanel";
import { validateClaims } from "@/lib/validate";
import type { Claim, RightKind } from "@/lib/types";

export default function ClaimEditor() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  /** 캡처 이미지를 OCR로 읽은 결과. 있으면 입력 양식을 이 값으로 채워 둔다. */
  const [ocr, setOcr] = useState<{ key: number; fileName: string; result: OcrParseResult } | null>(null);
  const nextId = useRef(1);
  /** 「권리분석 시작」을 누른 시점의 채권 목록. 채권이 바뀌면(목록이 새로 만들어지면) 결과를 다시 숨긴다. */
  const [startedClaims, setStartedClaims] = useState<Claim[] | null>(null);
  const started = startedClaims === claims;
  const validation = validateClaims(claims);

  const startAnalysis = () => {
    setStartedClaims(claims);
    setTimeout(() => document.querySelector("#sale-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  };

  const handleAdd = (
    kind: RightKind,
    values: FormValues,
    taxItems: FormValues[],
    isEntrusted: boolean,
  ) => {
    const id = `claim-${nextId.current++}`;
    const { claim, unreadable } = buildClaim(id, kind, values, taxItems, isEntrusted);
    // 캡처 이미지에서 채운 양식이면 원본 위치(출처)를 함께 남긴다. 사용한 뒤에는 양식을 비운다.
    setClaims((prev) => [...prev, ocr ? { ...claim, source: `캡처 이미지 OCR (${ocr.fileName})` } : claim]);
    setNotice(unreadable);
    setOcr(null);
  };

  const handleOcrRead = useCallback((result: OcrParseResult, fileName: string) => {
    setOcr({ key: Date.now(), fileName, result });
  }, []);

  return (
    <div className="space-y-8">
      <section aria-labelledby="input-heading" className="space-y-3">
        <h2 id="input-heading" className="text-xl font-semibold">
          <StepBadge n={1} /> 파일업로드
        </h2>
        <OcrImageReader onRead={handleOcrRead} />
        {ocr ? (
          <div role="status" className="space-y-1 rounded border border-violet-300 bg-violet-50 p-3 text-sm text-violet-900">
            <p className="font-medium">
              OCR로 읽은 값을 아래 입력 양식에 채웠습니다. 원본과 대조해 확인·수정한 뒤 「채권 추가」를 눌러야 분석에 쓰입니다.
            </p>
            <p>
              {ocr.result.filled.length > 0 ? `채운 칸: ${ocr.result.filled.join(" / ")}` : "채울 수 있는 값을 읽지 못했습니다. 직접 입력해 주세요."}
            </p>
            {ocr.result.notes.map((note) => (
              <p key={note} className="font-medium text-amber-800">{note}</p>
            ))}
          </div>
        ) : null}
        <ClaimForm
          key={ocr?.key ?? 0}
          onAdd={handleAdd}
          initial={ocr ? { kind: ocr.result.kind, values: ocr.result.values, taxItems: ocr.result.taxItems } : undefined}
        />
        {notice.length > 0 ? (
          <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            형식을 읽지 못해 빈칸으로 둔 칸이 있습니다: {notice.join(", ")}. 날짜는 2021-03-10처럼, 금액은 숫자만 입력해 주세요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="table-heading" className="space-y-3">
        <h2 id="table-heading" className="text-xl font-semibold">
          <StepBadge n={2} /> 입력 내용 확인
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          빈칸은 <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">(빈칸)</span>
          으로 붉게 표시됩니다. 추측해서 채우지 않습니다.
        </p>
        <ClaimTable claims={claims} onRemove={(id) => setClaims((prev) => prev.filter((c) => c.id !== id))} />
        {claims.length > 0 ? (
          <>
            <div className="space-y-2 pt-2">
              <h3 className="font-semibold">입력값 검사</h3>
              <ValidationPanel result={validation} />
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={startAnalysis}
                disabled={!validation.canCalculate}
                className="rounded bg-black px-6 py-3 font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                권리분석 시작
              </button>
              {!validation.canCalculate ? <p className="mt-2 text-sm text-zinc-600">입력값 검사를 통과해야 시작할 수 있습니다.</p> : null}
            </div>
          </>
        ) : null}
      </section>

      {claims.length > 0 && started ? <DistributionSection claims={claims} validation={validation} /> : null}
    </div>
  );
}
