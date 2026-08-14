import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PlannerStateProvider } from "@/components/planner/planner-state";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  let metadataBase = new URL("http://localhost:3000");
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
    metadataBase = new URL(`${protocol}://${host}`);
  }

  const title = "WEEKENDOG | 근거 있는 반려동물 동반 여행";
  const description =
    "공식 반려동물 동반 정보와 실제 이동시간을 바탕으로 부산 여행 장소를 확인하고 자연스러운 일정을 만드는 서비스";

  return {
    metadataBase,
    title: {
      default: title,
      template: "%s | WEEKENDOG",
    },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <SiteHeader />
        <PlannerStateProvider>
          <main>{children}</main>
        </PlannerStateProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
