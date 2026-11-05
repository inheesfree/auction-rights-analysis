// Design Ref: 상세 페이지 공통 틀 — 시작 화면과 같은 로고·색·글꼴로 맞춘 상단 메뉴와 제목 영역.
// 입력·표·결과 영역의 모양은 globals.css의 `.app-page` 규칙이 맡는다. 화면 로직은 바꾸지 않는다.

import Link from "next/link";
import type { ReactNode } from "react";

const MENU = [
  { label: "입찰고객용", href: "/statement" },
  { label: "담당자용", href: "/officer" },
] as const;

interface PageShellProps {
  /** 현재 화면 (메뉴 강조용). */
  current: "/statement" | "/officer";
  title: string;
  lead: string;
  /** 제목 아래 안내 문구(면책 등). */
  notice: string;
  children: ReactNode;
}

export default function PageShell({ current, title, lead, notice, children }: PageShellProps) {
  return (
    <div className="app-page min-h-screen w-full">
      <header className="app-header">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6" aria-label="주 메뉴">
          <Link href="/" aria-label="처음 화면">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG 파일이라 next/image 최적화가 필요 없다 */}
            <img src="/ico_logo_kr.svg" alt="온비드" width={110} height={48} className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-2 text-sm font-medium">
            {MENU.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined} className={item.href === current ? "app-tab app-tab-on" : "app-tab"}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <div className="app-title">
          <h1>{title}</h1>
          <p className="app-lead">{lead}</p>
          <p className="app-notice">{notice}</p>
        </div>
        <div className="app-body">{children}</div>
      </main>
    </div>
  );
}
