import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 시작 화면 글꼴: 본문은 Inter, 한글은 Noto Sans KR
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });
const notoSansKr = Noto_Sans_KR({ variable: "--font-noto-kr", preload: false, weight: ["500", "700", "900"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "공매 재산 권리분석",
  description: "공매 재산에 설정된 권리의 순위를 판단하고 그 근거를 보여주는 참고용 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${notoSansKr.variable} h-full antialiased`}
    >
      <head>
        {/* 시작 화면 글꼴: 제목은 Helvetica Now Display Bold(+한글은 Noto Sans KR), 본문은 Inter */}
        <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/04e6981992c0e2e7642af2074ebe3901?family=Helvetica+Now+Display+Bold" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
