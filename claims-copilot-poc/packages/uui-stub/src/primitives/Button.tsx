import React from "react";
import { tokens as t } from "../tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Rendered as an accessible tooltip when the control is disabled. */
  disabledReason?: string;
  /**
   * Visually and semantically unavailable, but still focusable.
   *
   * Prefer this over `disabled` whenever a reason is displayed alongside the control.
   * A natively disabled button is removed from the tab order, so assistive technology
   * never reaches it and never announces its `aria-describedby` explanation - which
   * would defeat the purpose of showing the reason at all (NFR-41, NFR-48).
   *
   * Activation is blocked in the click handler instead of by the DOM.
   */
  unavailable?: boolean;
}

const palette: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: t.color.navy700, color: t.color.white, border: `1px solid ${t.color.navy700}` },
  secondary: { background: t.color.white, color: t.color.navy700, border: `1px solid ${t.color.grey300}` },
  ghost: { background: "transparent", color: t.color.navy700, border: "1px solid transparent" },
  danger: { background: t.color.red500, color: t.color.white, border: `1px solid ${t.color.red500}` },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary", size = "md", fullWidth, disabledReason, disabled,
      unavailable, onClick, children, style, ...rest
    },
    ref
  ) {
    const isDisabled = Boolean(disabled);
    // `unavailable` yields to a hard `disabled` if a caller sets both.
    const isUnavailable = Boolean(unavailable) && !isDisabled;
    const inert = isDisabled || isUnavailable;

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isUnavailable) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      },
      [isUnavailable, onClick]
    );

    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        disabled={isDisabled}
        aria-disabled={inert || undefined}
        // Only fall back to a tooltip when no visible reason is being rendered.
        title={isDisabled ? disabledReason : rest.title}
        onClick={handleClick}
        style={{
          ...palette[variant],
          font: `${t.font.weight.semibold} ${size === "sm" ? t.font.size.sm : t.font.size.md} ${t.font.family}`,
          padding: size === "sm" ? "5px 11px" : "8px 16px",
          borderRadius: t.radius.md,
          cursor: inert ? "not-allowed" : "pointer",
          opacity: inert ? 0.5 : 1,
          width: fullWidth ? "100%" : undefined,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: t.space(1.5),
          transition: "filter .12s ease",
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

export interface IconButtonProps extends ButtonProps {
  "aria-label": string;
}

export function IconButton({ children, ...rest }: IconButtonProps) {
  return (
    <Button variant="ghost" size="sm" {...rest} style={{ padding: "5px 7px", ...rest.style }}>
      {children}
    </Button>
  );
}
