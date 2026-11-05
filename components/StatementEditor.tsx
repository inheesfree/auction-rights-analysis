"use client";

// Design Ref: §2.3 — 공매재산명세서 권리분석 (외부 사용자용)
// 엑셀 올리기 또는 직접 입력 → 읽은 내용 확인(원본 위치 표시, [확인 완료]) → 입력값 검사 → 권리 순위와 근거
// 매각금액을 모르므로 금액은 계산하지 않고 순위만 보여준다. 이름은 마스킹해서 보여준다.
// 엑셀은 사용자 브라우저 안에서만 읽고 서버로 보내거나 저장하지 않는다. 읽은 값은 사용자가 확인하기 전에는 분석에 쓰지 않는다.
// PDF·캡처 이미지에서 값을 읽는 기능(AI 읽기)은 별도 작업에서 붙인다.

import { useMemo, useRef, useState } from "react";
import StepBadge from "@/components/StepBadge";
import ClaimForm from "@/components/ClaimForm";
import ClaimTable from "@/components/ClaimTable";
import EvidencePanel from "@/components/EvidencePanel";
import StatementRanking from "@/components/StatementRanking";
import ValidationPanel from "@/components/ValidationPanel";
import { buildClaim, type FormValues } from "@/lib/claimForm";
import { parseDate } from "@/lib/dates";
import { MAX_EXCEL_BYTES, readWorkbookGrids } from "@/lib/excelFile";
import { maskClaim } from "@/lib/privacy";
import { analyzeStatement, type StatementAnalysis } from "@/lib/statement";
import { readStatementGrids, type ReadOptions, type SheetGrid } from "@/lib/statementExcel";
import { LEASE_REGIONS, LEASE_REGION_LABELS, type Claim, type LeaseRegion, type RightKind } from "@/lib/types";
import { validateClaims } from "@/lib/validate";

type Outcome = { kind: "analysis"; analysis: StatementAnalysis } | { kind: "error"; message: string };

function analyze(claims: readonly Claim[]): Outcome {
  try {
    return { kind: "analysis", analysis: analyzeStatement(claims) };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}

const SELECT_CLASS =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default function StatementEditor() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  const nextId = useRef(1);

  // 엑셀에서 읽은 내용
  const [grids, setGrids] = useState<SheetGrid[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [region, setRegion] = useState<LeaseRegion | "">("");
  const [housing, setHousing] = useState<"" | "yes" | "no">("");
  const [readWarnings, setReadWarnings] = useState<string[]>([]);
  const [addressText, setAddressText] = useState<string | null>(null);
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);
  /** 엑셀에서 읽은 값을 사용자가 아직 확인하지 않았으면 `true`. 확인하기 전에는 분석하지 않는다. */
  const [pendingConfirm, setPendingConfirm] = useState(false);
  /** 「권리분석 시작」을 누른 시점의 채권 목록. 채권이 하나라도 바뀌면(목록이 새로 만들어지면) 결과를 다시 숨긴다. */
  const [startedClaims, setStartedClaims] = useState<Claim[] | null>(null);
  const started = startedClaims === claims;

  const validation = validateClaims(claims);
  // 화면에는 이름을 가린 채권을 보여준다. 입력한 원래 값은 이 화면 안에만 있고 서버로 보내거나 저장하지 않는다.
  const shown = useMemo(() => claims.map(maskClaim), [claims]);
  const outcome = useMemo<Outcome | null>(
    () => (validation.canCalculate && started && !pendingConfirm ? analyze(claims) : null),
    [validation.canCalculate, started, pendingConfirm, claims],
  );

  /** 칸 글자에서 권리를 읽어 화면의 채권 목록(엑셀에서 읽은 것)을 바꾼다. 직접 입력한 채권은 그대로 둔다. */
  const applyGrids = (source: SheetGrid[], options: ReadOptions) => {
    const read = readStatementGrids(source, options);
    const fromFile: Claim[] = read.claims.map((item) => {
      const built = buildClaim(`claim-${nextId.current++}`, item.kind, item.values, item.taxItems, false).claim;
      return { ...built, source: item.source, ...(item.noAcquisition ? { noAcquisition: true } : {}) } as Claim;
    });
    setClaims((previous) => [...previous.filter((claim) => claim.source === undefined), ...fromFile]);
    setReadWarnings(read.warnings);
    setAddressText(read.addressText);
    if (options.isHousing === undefined && read.isHousing !== null) setHousing(read.isHousing ? "yes" : "no");
    setPendingConfirm(fromFile.length > 0);
  };

  const optionsFor = (nextRegion: LeaseRegion | "", nextHousing: "" | "yes" | "no"): ReadOptions => ({
    region: nextRegion,
    isHousing: nextHousing === "" ? undefined : nextHousing === "yes",
  });

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 올릴 수 있게 비운다
    if (!file) return;
    setReadError("");
    if (file.size > MAX_EXCEL_BYTES) {
      setReadError("파일이 너무 큽니다(5MB 이하만 읽습니다). 공매재산명세서 엑셀이 맞는지 확인해 주세요.");
      return;
    }
    setReading(true);
    try {
      const sheets = await readWorkbookGrids(await file.arrayBuffer());
      setGrids(sheets);
      setFileName(file.name);
      applyGrids(sheets, optionsFor(region, housing));
    } catch (error) {
      setReadError(`파일을 읽지 못했습니다. 엑셀(.xls, .xlsx) 파일이 맞는지 확인해 주세요. (${error instanceof Error ? error.message : "알 수 없는 오류"})`);
    } finally {
      setReading(false);
    }
  };

  const changeRegion = (next: LeaseRegion | "") => {
    setRegion(next);
    if (grids) applyGrids(grids, optionsFor(next, housing));
  };

  const changeHousing = (next: "" | "yes" | "no") => {
    setHousing(next);
    if (grids) applyGrids(grids, optionsFor(region, next));
  };

  /** 「권리분석 시작」: 읽은 값을 확인한 것으로 보고 분석을 시작한 뒤 결과 구역으로 이동한다. */
  const startAnalysis = () => {
    setPendingConfirm(false);
    setStartedClaims(claims);
    setTimeout(() => document.querySelector("#stmt-rank-heading, #stmt-stop-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  };

  const handleAdd = (kind: RightKind, values: FormValues, taxItems: FormValues[]) => {
    const id = `claim-${nextId.current++}`;
    const { claim, unreadable } = buildClaim(id, kind, values, taxItems, false);
    setClaims((prev) => [...prev, claim]);
    setNotice(unreadable);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="stmt-upload-heading" className="space-y-3">
        <h2 id="stmt-upload-heading" className="text-xl font-semibold">
          <StepBadge n={1} /> 파일 업로드
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          온비드 공매재산명세서를 엑셀(.xls, .xlsx)로 올리면 권리를 읽어 줍니다. 파일은 이 브라우저 안에서만 읽고 서버로 보내거나 저장하지 않습니다.
          읽은 값은 아래 확인 표에서 원본과 맞는지 확인한 뒤에 분석합니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor="stmt-file" className="mb-1 block text-sm font-medium">
              엑셀 파일
            </label>
            <input
              id="stmt-file"
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
              className="block w-full text-sm file:mr-3 file:rounded file:border file:border-zinc-300 file:bg-zinc-50 file:px-3 file:py-1.5 file:text-sm dark:file:border-zinc-700 dark:file:bg-zinc-900"
            />
          </div>
          <div>
            <label htmlFor="stmt-region" className="mb-1 block text-sm font-medium">
              소재지 구분
            </label>
            <select id="stmt-region" className={SELECT_CLASS} value={region} onChange={(e) => changeRegion(e.target.value as LeaseRegion | "")}>
              <option value="">(빈칸)</option>
              {LEASE_REGIONS.map((item) => (
                <option key={item} value={item}>
                  {LEASE_REGION_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stmt-housing" className="mb-1 block text-sm font-medium">
              주택 여부
            </label>
            <select id="stmt-housing" className={SELECT_CLASS} value={housing} onChange={(e) => changeHousing(e.target.value as "" | "yes" | "no")}>
              <option value="">(빈칸 · 재산 표시로 짐작)</option>
              <option value="yes">예</option>
              <option value="no">아니오</option>
            </select>
          </div>
        </div>
        {addressText ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            공매재산 주소: {addressText} — 임차인의 소액임차 기준을 정하려면 위 「소재지 구분」을 골라 주세요. (주소로 자동 판단하지 않습니다.)
          </p>
        ) : null}
        {reading ? <p className="text-sm">읽는 중입니다…</p> : null}
        {readError ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            {readError}
          </p>
        ) : null}
        {readWarnings.length > 0 ? (
          <div role="alert" className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">읽다가 확인이 필요한 곳이 있습니다 ({fileName})</p>
            <ul className="list-disc space-y-1 pl-5">
              {readWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="stmt-input-heading" className="space-y-3">
        <h2 id="stmt-input-heading" className="text-xl font-semibold">
          직접 입력 (엑셀이 없을 때)
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>명세서의 「배분요구 및 채권신고 현황」 표에 있는 권리를 하나씩 입력해 주세요.</li>
          <li>법정기일이 기간(예: 2026-02-10 ~ 2026-09-10)으로 적혀 있으면 <strong>시작일</strong>을 입력합니다.</li>
          <li>당해세라고 별도로 적혀 있지 않으면 당해세 여부는 「아니오」로 입력합니다.</li>
          <li>임차인은 「임차인 배분 요구 및 채권신고 현황」의 전입일, 확정일자, 보증금을 입력합니다.</li>
        </ul>
        <ClaimForm onAdd={handleAdd} showEntrusted={false} />
        {notice.length > 0 ? (
          <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            형식을 읽지 못해 빈칸으로 둔 칸이 있습니다: {notice.join(", ")}. 날짜는 2021-03-10처럼, 금액은 숫자만 입력해 주세요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="stmt-table-heading" className="space-y-3">
        <h2 id="stmt-table-heading" className="text-xl font-semibold">
          <StepBadge n={2} /> 입력 내용 확인
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          이름은 개인정보 보호를 위해 가려서 보여줍니다. 읽지 못한 값은 추측해서 채우지 않고 빈칸으로 둡니다. 「원본 위치」는 엑셀의 시트와 행입니다.
        </p>
        <ClaimTable
          claims={shown}
          onRemove={(id) => setClaims((prev) => prev.filter((c) => c.id !== id))}
          onEditLeaseDates={(id, moveIn, fixed) =>
            setClaims((prev) =>
              prev.map((c) =>
                c.id === id && c.kind === "lease"
                  ? { ...c, moveInDate: parseDate(moveIn), fixedDate: parseDate(fixed) }
                  : c,
              ),
            )
          }
        />
        {pendingConfirm ? (
          <div role="alert" className="space-y-2 rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
            <p>
              엑셀에서 읽은 값입니다. 위 표를 원본 명세서와 맞춰 보고, 임차인의 전입일자·확정일자는 줄의 「날짜 입력」으로 바로 고칠 수 있고, 틀리거나 빠진 다른 권리는 삭제한 뒤 아래 직접 입력으로 다시 넣어 주세요. 아래 「권리분석 시작」을 누르기 전에는 분석하지 않습니다.
            </p>
          </div>
        ) : null}
        {claims.length > 0 ? (
          <div className="space-y-2 pt-2">
            <h3 className="font-semibold">입력값 검사</h3>
            <ValidationPanel result={validation} successMessage="입력에 문제가 없습니다. 「권리분석 시작」을 누르면 아래에 권리 순위가 나옵니다." />
          </div>
        ) : null}
        {claims.length > 0 ? (
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
        ) : null}
      </section>

      {outcome === null ? null : outcome.kind === "error" ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          분석하지 못했습니다: {outcome.message}
        </p>
      ) : !outcome.analysis.ok ? (
        <section aria-labelledby="stmt-stop-heading" className="space-y-2">
          <h2 id="stmt-stop-heading" className="text-xl font-semibold">
            <StepBadge n={3} /> 권리분석 결과
          </h2>
          <div role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-semibold">이 앱이 분석하지 않는 경우</p>
            <ul className="list-disc space-y-1 pl-5">
              {outcome.analysis.messages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="stmt-rank-heading" className="space-y-3">
            <h2 id="stmt-rank-heading" className="text-xl font-semibold">
              <StepBadge n={3} /> 권리분석 결과
            </h2>
            <StatementRanking analysis={outcome.analysis} />
            <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {outcome.analysis.notices.map((text, index) => (
                <li key={index}>※ {text}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="stmt-evidence-heading" className="space-y-3">
            <h2 id="stmt-evidence-heading" className="text-xl font-semibold">
              분석 근거
            </h2>
            <EvidencePanel
              evidence={{
                steps: [],
                judgments: outcome.analysis.judgments,
                unverifiedCount: outcome.analysis.unverifiedCount,
                notices: [],
                verification: "",
              }}
              showProcess={false}
            />
          </section>
        </>
      )}
    </div>
  );
}
