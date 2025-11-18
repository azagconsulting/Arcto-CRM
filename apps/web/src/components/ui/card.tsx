import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, action, children, className }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/5 bg-white/5/30 p-6 shadow-[0_30px_60px_-45px_rgba(15,23,42,1)] backdrop-blur",
        className,
      )}
    >
      {(title || description || action) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>
          {action && <div className="text-sm text-slate-300">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
