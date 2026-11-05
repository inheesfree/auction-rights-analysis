"use client";

// 담당자용 — 캡처 이미지를 OCR(글자 읽기)로 읽어 입력 양식에 채운다.
// 담당자 확인 (2026-11-05): AI 서비스가 아니라 브라우저 안에서 도는 OCR(Tesseract.js)을 쓴다.
//  - Windows 내장 OCR은 Windows 프로그램에서만 쓸 수 있어 배포 사이트(Vercel)와 브라우저에서는 쓸 수 없다.
//  - 이미지는 서버로 보내지 않고 이 브라우저 안에서만 읽는다. 읽은 뒤 이미지·글자를 저장하지 않는다.
//  - 글자 인식 데이터(kor, eng)만 처음 한 번 인터넷에서 내려받는다(이미지는 나가지 않음).
// 읽은 값은 입력 양식에 채워만 두고, 담당자가 확인·수정해 「채권 추가」를 눌러야 분석에 쓰인다.

import { useCallback, useEffect, useRef, useState } from "react";
import { parseOcrText, type OcrParseResult } from "@/lib/ocrParse";
import { maskResidentNumbers } from "@/lib/privacy";

interface OcrImageReaderProps {
  /** 읽기가 끝나면 채울 값과 이미지 이름을 넘긴다. */
  onRead: (result: OcrParseResult, fileName: string) => void;
}

const ACCEPT = "image/png,image/jpeg,image/bmp,image/webp";

export default function OcrImageReader({ onRead }: OcrImageReaderProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 미리보기 주소는 바뀌거나 화면에서 사라질 때 반드시 해제한다.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const readImage = useCallback(
    async (file: File, displayName: string) => {
      if (!file.type.startsWith("image/")) {
        setError("이미지 파일(png, jpg 등)만 읽을 수 있습니다.");
        return;
      }
      setBusy(true);
      setError(null);
      setRawText(null);
      setProgress(0);
      setStatus("글자 읽는 준비 중… (처음에는 인식 데이터를 내려받느라 시간이 걸립니다)");
      setPreviewUrl(URL.createObjectURL(file));
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("kor+eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setStatus("이미지의 글자를 읽는 중…");
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        try {
          const { data } = await worker.recognize(file);
          // 주민등록번호처럼 보이는 값은 화면에 보이기 전에 가린다.
          const text = maskResidentNumbers(data.text);
          setRawText(text);
          onRead(parseOcrText(text), displayName);
          setStatus("읽기를 마쳤습니다. 입력 양식에 채워진 값을 확인해 주세요.");
        } finally {
          await worker.terminate();
        }
      } catch {
        // 읽은 값이나 파일 내용은 오류 안내에 남기지 않는다.
        setError("이미지를 읽지 못했습니다. 인터넷 연결을 확인하거나 더 선명한 캡처로 다시 시도해 주세요.");
        setStatus("");
      } finally {
        setBusy(false);
      }
    },
    [onRead],
  );

  // 캡처(Win+Shift+S) 뒤 Ctrl+V로 붙여넣은 이미지도 읽는다.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file && !busy) {
        event.preventDefault();
        void readImage(file, "붙여넣은 캡처 이미지");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [busy, readImage]);

  return (
    <div className="space-y-3 rounded border border-zinc-300 p-4 dark:border-zinc-700">
      <div>
        <h3 className="font-semibold">캡처 이미지에서 읽어 채우기</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          캡처 이미지를 올리거나 Ctrl+V로 붙여넣으면, 이 브라우저 안에서 글자를 읽어 아래 입력 양식에 채웁니다.
          이미지는 서버로 보내거나 저장하지 않습니다. 채권자 이름은 가져오지 않으니 직접 입력해 주세요.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          aria-label="캡처 이미지 파일 선택"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readImage(file, file.name);
            e.target.value = "";
          }}
        />
        {busy ? <span className="text-sm text-zinc-600" role="status">{status} {progress > 0 ? `${progress}%` : ""}</span> : null}
      </div>
      {!busy && status ? <p className="text-sm text-emerald-700" role="status">{status}</p> : null}
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {previewUrl && rawText !== null ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">읽은 원본 글자와 이미지 보기 (값이 맞는지 대조)</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저 안의 임시 주소(blob)라 next/image를 쓸 수 없다 */}
            <img src={previewUrl} alt="올린 캡처 이미지" className="max-h-72 w-full rounded border border-zinc-300 object-contain" />
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{rawText || "(읽은 글자 없음)"}</pre>
          </div>
        </details>
      ) : null}
    </div>
  );
}
