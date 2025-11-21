import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

const baseStyles =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={clsx(
        baseStyles,
        invalid && "border-rose-400/60 text-rose-100",
        className,
      )}
      {...props}
    />
  );
});
