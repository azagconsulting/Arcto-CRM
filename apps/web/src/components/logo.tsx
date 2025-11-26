import Link from "next/link";
import { clsx } from "clsx";
import Image from "next/image";

interface LogoProps {
  className?: string;
  href?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, href = "/", size = 44, showText = true }: LogoProps) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-3", className)}>
      <Image
        src="/arcto-logo.svg"
        alt="Arcto"
        width={size + 4}
        height={size + 4}
        className="rounded-2xl"
        priority
      />
      {showText && (
        <div className="leading-tight">
          <p className="text-[14px] uppercase tracking-[0.28em] text-slate-400">Arcto Labs</p>
        </div>
      )}
    </Link>
  );
}
