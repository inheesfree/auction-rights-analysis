"use client";

// 담당자용 입장 화면 — 사번(숫자 6자리) 형식을 확인한 뒤 담당자용 화면을 연다.
// 담당자 확인 (2026-11-05): 형식만 확인하는 입장 화면이다. 서버로 보내거나 저장하지 않고,
// 입력값은 이 화면(브라우저 탭)의 메모리에만 있다. 새로고침하면 다시 입력한다. 보안 장치가 아니다.

import { useId, useState } from "react";
import { EMPLOYEE_ID_LENGTH, isValidEmployeeId, sanitizeEmployeeId } from "@/lib/employeeId";

export default function OfficerGate({ children }: { children: React.ReactNode }) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (employeeId !== null) {
    return (
      <>
        <div className="mb-4 flex items-center justify-between rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          <span>사번 {employeeId}</span>
          <button
            type="button"
            onClick={() => {
              setEmployeeId(null);
              setDraft("");
            }}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            사번 다시 입력
          </button>
        </div>
        {children}
      </>
    );
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidEmployeeId(draft)) {
      setError(`사번은 숫자 ${EMPLOYEE_ID_LENGTH}자리입니다. 다시 확인해 주세요.`);
      return;
    }
    setError(null);
    setEmployeeId(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-4 rounded border border-zinc-300 p-6 dark:border-zinc-700">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
          사번 입력
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={EMPLOYEE_ID_LENGTH}
          placeholder={`숫자 ${EMPLOYEE_ID_LENGTH}자리`}
          value={draft}
          onChange={(e) => {
            setDraft(sanitizeEmployeeId(e.target.value));
            setError(null);
          }}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          담당자용 화면에 들어가기 위한 입력입니다. 서버로 보내거나 저장하지 않습니다.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        입장
      </button>
    </form>
  );
}
