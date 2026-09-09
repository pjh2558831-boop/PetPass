import Link from "next/link";
import type { ReactNode } from "react";
import "./legal.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <article className="legal-document">
    <Link href="/" className="legal-home">← WEEKENDOG 홈</Link>
    <nav aria-label="정책 문서" className="legal-nav">
      <Link href="/privacy">개인정보처리방침</Link>
      <Link href="/terms">이용약관</Link>
    </nav>
    {children}
  </article>;
}
