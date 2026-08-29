import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PerformanceInstrumentation } from "@/components/performance-instrumentation";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3108";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "렌트플로우 | 놓치기 전에 움직이는 임대 관리", template: "%s | 렌트플로우" },
  description: "월세, 계약 만료, 수리 요청을 하나의 오늘 할 일로 연결하는 임대 운영 서비스",
  applicationName: "렌트플로우",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "렌트플로우",
    description: "놓치기 전에 움직이는 임대 관리",
    images: [{ url: "/assets/rentflow/hero-night-building.jpg", width: 1200, height: 630 }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfafd" },
    { media: "(prefers-color-scheme: dark)", color: "#100b2c" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        {children}
        <PerformanceInstrumentation />
      </body>
    </html>
  );
}
