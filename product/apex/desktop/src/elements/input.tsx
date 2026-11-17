import { useId } from "react";
import type { InputProps } from "@/elements/contract.ts";

const kinds = { text: { type: "text", mode: "text", fill: "off" }, email: { type: "email", mode: "email", fill: "email" }, code: { type: "text", mode: "numeric", fill: "one-time-code" } } as const;

export function Input ({ value, onChange, label, kind = "text", placeholder, invalid = false, disabled = false }: InputProps ) {

    const id = useId();
    const { type, mode, fill } = kinds[kind];

    return (
        <div data-ui="field" data-kind={kind} className="flex w-full flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
            <input
                id={id}
                type={type}
                inputMode={mode}
                autoComplete={fill}
                value={value}
                placeholder={placeholder}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                dir={kind === "text" ? undefined : "ltr"}
                onChange={( event ) => onChange(event.target.value)}
                className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 text-base text-ink outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-[invalid=true]:border-danger disabled:opacity-50"
            />
        </div>
    );

}
