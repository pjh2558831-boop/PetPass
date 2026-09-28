import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PlannerStateProvider } from "@/components/planner/planner-state";
import "./weekendog-globals.css";
import "./redesigned-pages.css";
import "./homepage-v4.css";

const title = "WEEKENDOG | 반려견과 함께하는 여행 장소와 일정";
const description =
  "한국관광공사 반려동물 동반 정보와 실제 장소 정보를 확인하고, 반려견과 함께 갈 여행 장소와 일정을 찾아보세요.";

export const metadata: Metadata = {
  metadataBase: new URL("https://weekendog.site"),
  title: { default: title, template: "%s | WEEKENDOG" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ko_KR",
    siteName: "WEEKENDOG",
    url: "https://weekendog.site/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "WEEKENDOG 반려동물 동반 여행" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  verification: {
    google: "VCUVsT7X6WvnuLZWDOyVvoOWUJKH-l9WZg8cda3T9Bo",
    ...(process.env.NAVER_SITE_VERIFICATION
      ? { other: { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } }
      : {}),
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <SiteHeader />
        <PlannerStateProvider>
          <main id="main-content" tabIndex={-1}>{children}</main>
        </PlannerStateProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
