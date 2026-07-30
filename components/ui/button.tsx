import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const styles = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#236148] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#194b38] disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#cbd8d0] bg-white px-5 py-2.5 text-sm font-bold text-[#294b3d] transition hover:border-[#84aa96] hover:bg-[#f4faf6] disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#486257] transition hover:bg-[#edf6f0] disabled:opacity-50",
} as const;

type Variant = keyof typeof styles;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${styles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}
