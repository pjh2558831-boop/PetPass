import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
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

  const title = "PetPass | 근거 있는 반려동물 동반 여행";
  const description =
    "반려동물 조건과 시설 규정을 비교해 부산의 현실적인 동반 여행 경로를 만드는 지도 기반 플래너";

  return {
    metadataBase,
    title: {
      default: title,
      template: "%s | PetPass",
    },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      images: [
        {
          url: "/og.png",
          width: 1536,
          height: 1024,
          alt: "PetPass — 함께 들어갈 수 있는 곳만 이어요.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
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
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
