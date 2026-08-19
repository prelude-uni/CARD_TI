import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "CardTI | 나의 소비 MBTI",
  description:
    "카드 명세서를 분석해 CARD-TI 소비 유형과 또래 대비 소비지수를 확인합니다.",
  verification: {
    google: "GV9rSDBRO-gJDY3CpSchx2gmUrPbAWVMiGblLUsVOtc",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-Q9C8LN40T5"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-Q9C8LN40T5');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
