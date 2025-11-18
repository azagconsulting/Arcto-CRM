import Link from "next/link";
import { clsx } from "clsx";

interface LogoProps {
  className?: string;
  href?: string;
}

export function Logo({ className, href = "/" }: LogoProps) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-3", className)}>
      <span className="relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-fuchsia-500 shadow-[0_10px_40px_rgba(8,47,73,0.45)]">
        <span className="text-lg font-black text-slate-950">A</span>
      </span>
      <div className="leading-tight">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Arcto</p>
        <p className="text-lg font-semibold text-white">CRM Workspace</p>
      </div>
    </Link>
  );
}
