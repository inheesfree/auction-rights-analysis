"use client";

// Design Ref: §2.2 ②③ — 직접 입력한 채권을 모아 확인 표로 보여준다.
// Plan SC: 작업 3 — 입력 → 확인 표. 입력값 검사와 계산은 이후 작업(4~)에서 붙인다.

import { useRef, useState } from "react";
import ClaimForm from "@/components/ClaimForm";
import ClaimTable from "@/components/ClaimTable";
import { buildClaim, type FormValues } from "@/lib/claimForm";
import ValidationPanel from "@/components/ValidationPanel";
import { validateClaims } from "@/lib/validate";
import type { Claim, RightKind } from "@/lib/types";

export default function ClaimEditor() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  const nextId = useRef(1);

  const handleAdd = (
    kind: RightKind,
    values: FormValues,
    taxItems: FormValues[],
    isEntrusted: boolean,
  ) => {
    const id = `claim-${nextId.current++}`;
    const { claim, unreadable } = buildClaim(id, kind, values, taxItems, isEntrusted);
    setClaims((prev) => [...prev, claim]);
    setNotice(unreadable);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="input-heading" className="space-y-3">
        <h2 id="input-heading" className="text-xl font-semibold">
          ① 채권자 직접 입력
        </h2>
        <ClaimForm onAdd={handleAdd} />
        {notice.length > 0 ? (
          <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            형식을 읽지 못해 빈칸으로 둔 칸이 있습니다: {notice.join(", ")}. 날짜는 2021-03-10처럼, 금액은 숫자만 입력해 주세요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="table-heading" className="space-y-3">
        <h2 id="table-heading" className="text-xl font-semibold">
          ② 입력한 내용 확인
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          빈칸은 <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">(빈칸)</span>
          으로 붉게 표시됩니다. 추측해서 채우지 않습니다.
        </p>
        <ClaimTable claims={claims} onRemove={(id) => setClaims((prev) => prev.filter((c) => c.id !== id))} />
      </section>

      {claims.length > 0 ? (
        <section aria-labelledby="validation-heading" className="space-y-3">
          <h2 id="validation-heading" className="text-xl font-semibold">
            ③ 입력값 검사
          </h2>
          <ValidationPanel result={validateClaims(claims)} />
        </section>
      ) : null}
    </div>
  );
}
