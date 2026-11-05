"use client";

// Design Ref: §2.2 ②, §3.2 — 채권자 직접 입력. 권리 종류를 고르면 그 종류에 필요한 칸이 나타난다.
// Plan SC: 작업 3 — 입력 글자를 읽지 못하면 추측하지 않고 빈칸으로 두고 알려준다.

import { useId, useState } from "react";
import {
  COMMON_FIELDS,
  fieldsForKind,
  SELECTABLE_KINDS,
  TAX_ITEM_FIELDS,
  type FieldDef,
  type FormValues,
} from "@/lib/claimForm";
import { autoFormatDateInput } from "@/lib/dates";
import { LEASE_REGIONS, LEASE_REGION_LABELS, RIGHT_KIND_LABELS, type RightKind } from "@/lib/types";

const INPUT_CLASS =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/** 칸 하나. 칸의 모양(글자·금액·날짜·예/아니오·선택)에 맞는 입력창을 보여준다. */
function FieldInput({
  def,
  inputId,
  value,
  onChange,
}: {
  def: FieldDef;
  inputId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  let input: React.ReactNode;
  switch (def.type) {
    case "yesNo":
      input = (
        <select id={inputId} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">(빈칸)</option>
          <option value="yes">예</option>
          <option value="no">아니오</option>
        </select>
      );
      break;
    case "taxType":
      input = (
        <select id={inputId} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">(빈칸)</option>
          <option value="national">국세</option>
          <option value="local">지방세</option>
        </select>
      );
      break;
    case "wageType":
      input = (
        <select id={inputId} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">(빈칸)</option>
          <option value="last3Months">최종 3개월분 (최우선변제)</option>
          <option value="general">일반 임금</option>
        </select>
      );
      break;
    case "region":
      input = (
        <select id={inputId} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">(빈칸)</option>
          {LEASE_REGIONS.map((region) => (
            <option key={region} value={region}>
              {LEASE_REGION_LABELS[region]}
            </option>
          ))}
        </select>
      );
      break;
    default:
      input = (
        <input
          id={inputId}
          type="text"
          className={INPUT_CLASS}
          value={value}
          inputMode={def.type === "won" ? "numeric" : undefined}
          placeholder={def.hint}
          onChange={(e) => onChange(def.type === "date" ? autoFormatDateInput(e.target.value) : e.target.value)}
        />
      );
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        {def.label}
      </label>
      {input}
    </div>
  );
}

interface ClaimFormProps {
  /** 「채권 추가」를 누르면 입력 글자를 부모에게 넘긴다. 채권으로 바꾸는 일은 부모(ClaimEditor)가 한다. */
  onAdd: (kind: RightKind, values: FormValues, taxItems: FormValues[], isEntrusted: boolean) => void;
  /** 「수임 채권」 체크칸을 보여줄지. 담당자용에서만 쓴다. 기본값은 보여줌. */
  showEntrusted?: boolean;
}

export default function ClaimForm({ onAdd, showEntrusted = true }: ClaimFormProps) {
  const formId = useId();
  const [kind, setKind] = useState<RightKind>("mortgage");
  const [values, setValues] = useState<FormValues>({});
  const [taxItems, setTaxItems] = useState<FormValues[]>([{}]);
  const [isEntrusted, setIsEntrusted] = useState(false);

  const setValue = (key: string, next: string) => setValues((prev) => ({ ...prev, [key]: next }));
  const setTaxItemValue = (index: number, key: string, next: string) =>
    setTaxItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: next } : item)));

  // 권리 종류를 바꾸면 다른 종류의 입력이 섞이지 않도록 입력칸을 비운다.
  const changeKind = (next: RightKind) => {
    setKind(next);
    setValues({});
    setTaxItems([{}]);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAdd(kind, values, taxItems, isEntrusted);
    setValues({});
    setTaxItems([{}]);
    setIsEntrusted(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded border border-zinc-300 p-4 dark:border-zinc-700">
      <div>
        <label htmlFor={`${formId}-kind`} className="mb-1 block text-sm font-medium">
          권리 종류
        </label>
        <select
          id={`${formId}-kind`}
          className={INPUT_CLASS}
          value={kind}
          onChange={(e) => changeKind(e.target.value as RightKind)}
        >
          {SELECTABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {RIGHT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[...COMMON_FIELDS, ...fieldsForKind(kind)]
          .filter((def) => !def.showWhen || values[def.showWhen.key] === def.showWhen.equals)
          .map((def) => (
          <FieldInput
            key={`${kind}-${def.key}`}
            def={def}
            inputId={`${formId}-${kind}-${def.key}`}
            value={values[def.key] ?? ""}
            onChange={(next) => setValue(def.key, next)}
          />
        ))}
      </div>

      {kind === "tax" ? (
        <fieldset className="space-y-3 rounded border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-sm font-medium">세목 (한 건의 교부청구 안에 세목이 여러 개일 수 있습니다)</legend>
          {taxItems.map((item, index) => (
            <div key={index} className="space-y-2 rounded bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">세목 {index + 1}</span>
                {taxItems.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setTaxItems((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    이 세목 삭제
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TAX_ITEM_FIELDS.map((def) => (
                  <FieldInput
                    key={def.key}
                    def={def}
                    inputId={`${formId}-tax-${index}-${def.key}`}
                    value={item[def.key] ?? ""}
                    onChange={(next) => setTaxItemValue(index, def.key, next)}
                  />
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTaxItems((prev) => [...prev, {}])}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            + 세목 추가
          </button>
        </fieldset>
      ) : null}

      {showEntrusted ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isEntrusted} onChange={(e) => setIsEntrusted(e.target.checked)} />
          수임 채권 (우리가 맡은 체납세금)
        </label>
      ) : null}

      <button
        type="submit"
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        채권 추가
      </button>
    </form>
  );
}
