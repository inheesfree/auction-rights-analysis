"use client";

// Design Ref: 시작 화면 히어로 — 전체 화면 배경 영상 + 상단 메뉴 + 제목/설명/버튼.
// 담당자 확인 (2026-11-05): 시안 스타일을 적용하고 제목은 「손 쉬운 공매 권리분석」, 나머지 문구는 이후 담당자가 지시해 수정한다.
// 모바일에서는 오른쪽에서 밀려 나오는 메뉴를 쓴다. 메뉴·버튼은 기존 화면(/statement, /officer)으로 연결한다.

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowRightCircle, Menu, Scale, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_003132_8b7edcb6-c64d-4a52-a9ca-879942e122ad.mp4";

const NAV_LINKS = [
  { label: "입찰고객용", href: "/statement" },
  { label: "담당자용", href: "/officer" },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.15, duration: 0.6, ease: EASE } }),
};

// 로고: public/ico_logo_kr.svg (담당자 제공, 110×48)
function Logo() {
  // eslint-disable-next-line @next/next/no-img-element -- SVG 파일이라 next/image 최적화가 필요 없다
  return <img src="/ico_logo_kr.svg" alt="온비드" width={110} height={48} className="h-10 w-auto" />;
}

function ActionButtons() {
  return (
    <>
      <Link href="/statement" className="rounded-full px-5 py-2.5 text-center text-sm font-medium text-white" style={{ background: "var(--color-accent)" }}>
        명세서 올리기
      </Link>
      <Link href="/officer" className="rounded-full px-5 py-2.5 text-center text-sm font-medium" style={{ background: "var(--color-login-bg)", color: "var(--color-text)" }}>
        담당자용 열기
      </Link>
    </>
  );
}

export default function HomeHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
      <video className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline src={VIDEO_URL} aria-hidden="true" />

      <nav className="relative z-10 mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5" aria-label="주 메뉴">
        <Link href="/" aria-label="처음 화면">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium md:flex">
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="transition-opacity hover:opacity-60">
              {item.label}
            </Link>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <ActionButtons />
        </div>
        <button type="button" className="md:hidden" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
          <Menu size={26} />
        </button>
      </nav>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: "rgba(25,40,55,0.35)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 z-50 flex flex-col p-5"
              style={{ width: "min(88vw, 360px)", height: "100dvh", background: "#CFC8C5", boxShadow: "-12px 0 48px rgba(25,40,55,0.18)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.45, ease: EASE }}
              aria-label="메뉴"
            >
              <div className="flex items-center justify-between pb-4" style={{ borderBottom: "1px solid rgba(25,40,55,0.15)" }}>
                <Logo />
                <button type="button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}>
                  <X size={26} />
                </button>
              </div>
              <div className="flex flex-col gap-5 py-7">
                {NAV_LINKS.map((item, i) => (
                  <motion.div key={item.href} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.18 + i * 0.07 } }}>
                    <Link href={item.href} className="text-2xl" style={{ fontFamily: "var(--font-heading)" }} onClick={() => setMenuOpen(false)}>
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
              <div className="mt-auto grid gap-2.5">
                <ActionButtons />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <section className="relative z-10 mx-auto max-w-[1280px] px-5 sm:px-8" style={{ paddingTop: "clamp(40px, 8vw, 72px)" }}>
        <div className="max-w-[560px]">
          <motion.h1
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "clamp(1.65rem, 5vw, 3rem)", lineHeight: 1.2, letterSpacing: "-0.01em", color: "#192837", marginBottom: 24 }}
          >
            <Zap size={24} className="relative mx-1 inline align-middle" style={{ top: -2 }} aria-hidden="true" />
            손 쉬운 공매
            <Scale size={24} className="relative mx-1 inline align-middle" style={{ top: -2 }} aria-hidden="true" />
            권리분석
          </motion.h1>
          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            style={{ fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)", lineHeight: 1.65, opacity: 0.8, maxWidth: 560, marginBottom: 32 }}
          >
            온비드 공매재산명세서 엑셀을 올리면 권리를 읽어 순위를 정하고, 어떤 권리를 매수인이 인수하는지 법령 기준과 함께 보여줍니다. 계산은 AI가 아닌 정해진 규칙으로만 합니다.
          </motion.p>
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <motion.div whileHover={{ scale: 1.04, filter: "brightness(1.1)" }} whileTap={{ scale: 0.96 }} className="inline-block">
              <Link
                href="/statement"
                className="flex items-center justify-between font-semibold text-white"
                style={{
                  background: "var(--color-accent)",
                  borderRadius: 50,
                  padding: "17px 24px",
                  fontSize: "clamp(0.9rem, 2vw, 1rem)",
                  boxShadow: "0 4px 24px rgba(115,66,226,0.28)",
                  minWidth: 210,
                  gap: 32,
                }}
              >
                명세서 올리기
                <ArrowRightCircle size={20} aria-hidden="true" />
              </Link>
            </motion.div>
            <p className="mt-5 text-sm" style={{ opacity: 0.8 }}>
              공매관리 담당자이신가요?{" "}
              <Link href="/officer" className="underline underline-offset-4">
                담당자용 화면으로 가기
              </Link>
            </p>
          </motion.div>
        </div>
      </section>

      <p className="absolute bottom-0 left-0 right-0 z-10 mx-auto max-w-[1280px] px-5 pb-5 text-xs sm:px-8" style={{ opacity: 0.75 }}>
        <span className="rounded bg-white/70 px-2 py-1">참고용이며 법적 효력이 없습니다. 올린 파일은 브라우저 안에서만 읽고 서버에 저장하지 않습니다.</span>
      </p>
    </div>
  );
}
