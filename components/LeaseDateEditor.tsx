"use client";

// 읽은 표에서 임차인의 전입일자·확정일자를 바로 고치는 작은 입력창.
// 명세서에서 읽지 못한 날짜(예: 위임기관이 주택도시보증공사인 임차인)를 사용자가 직접 채울 때 쓴다.

import { useState } from "react";
import { parseDate } from "@/lib/dates";

interface LeaseDateEditorProps {
  moveInDate: string | null;
  fixedDate: string | null;
  /** 저장. 날짜 형식이 맞는 값만 넘어온다. 빈 문자열은 "빈칸으로 둔다"는 뜻이다. */
  onSave: (moveInDate: string, fixedDate: string) => void;
}

const INPUT_CLASS = "w-32 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900";

export default function LeaseDateEditor({ moveInDate, fixedDate, onSave }: LeaseDateEditorProps) {
  const [open, setOpen] = useState(false);
  const [moveIn, setMoveIn] = useState(moveInDate ?? "");
  const [fixed, setFixed] = useState(fixedDate ?? "");
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        날짜 입력
      </button>
    );
  }

  const save = () => {
    const a = moveIn.trim();
    const b = fixed.trim();
    if ((a !== "" && parseDate(a) === null) || (b !== "" && parseDate(b) === null)) {
      setError("날짜는 2021-03-10처럼 입력해 주세요.");
      return;
    }
    setError("");
    onSave(a, b);
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs">
        전입일자
        <input className={`${INPUT_CLASS} ml-1`} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} placeholder="2021-03-10" />
      </label>
      <label className="block text-xs">
        확정일자
        <input className={`${INPUT_CLASS} ml-1`} value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="2021-03-10" />
      </label>
      {error ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="flex gap-1">
        <button type="button" onClick={save} className="rounded bg-black px-2 py-1 text-xs text-white dark:bg-white dark:text-black">
          저장
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
          취소
        </button>
      </div>
    </div>
  );
}
