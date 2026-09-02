import React from "react";
import { useT } from "@poc/i18n";
import { tokens as t } from "../tokens";
import { Button, ButtonProps } from "./Button";

/**
 * An action that may be withheld by the entitlement model, with the reason shown
 * on screen rather than hidden in a tooltip.
 *
 * Why this exists
 *   NFR-41 requires clear, user-friendly messages whenever something impacts
 *   functionality, explaining in plain language what went wrong and what the user can
 *   do next. A greyed-out button carrying only a native `title` fails that on two
 *   counts: sighted users have no reason to hover, and a natively disabled control is
 *   skipped by Tab so assistive technology never announces the explanation at all.
 *
 * How it satisfies it
 *   - The control stays focusable via `unavailable` rather than `disabled`, so
 *     keyboard and screen-reader users reach it.
 *   - `aria-describedby` binds the visible reason to the control, so the explanation
 *     is announced on focus (NFR-48, WCAG 2.2 AA).
 *   - `nextStep` supplies the "what you can do next" half of NFR-41.
 *
 * Scope
 *   Use this for durable entitlement gates - a privilege the user does not hold.
 *   Transient form state ("complete the required fields") should stay on `disabled`
 *   with a tooltip: the form's own required-field markers already carry that message,
 *   and an inline notice per incomplete field would be noise.
 */
export interface GatedActionProps
  extends Omit<ButtonProps, "disabled" | "disabledReason" | "unavailable"> {
  /** When false the action is withheld and the reason is rendered. */
  allowed: boolean;
  /** Plain-language explanation of why the action is unavailable. */
  reason: string;
  /**
   * What the user can do about it. Defaults to the shared
   * "contact your client administrator" guidance.
   */
  nextStep?: string;
  /** Suppresses the shared next-step line where it would not apply. */
  hideNextStep?: boolean;
}

export function GatedAction({
  allowed, reason, nextStep, hideNextStep, children, style, ...buttonProps
}: GatedActionProps) {
  const tr = useT();
  const noticeId = React.useId();

  if (allowed) {
    return <Button style={style} {...buttonProps}>{children}</Button>;
  }

  const guidance = hideNextStep ? null : nextStep ?? tr("common.request_access");

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: t.space(1.5),
        minWidth: 0,
        width: buttonProps.fullWidth ? "100%" : undefined,
      }}
    >
      <Button
        unavailable
        aria-describedby={noticeId}
        style={style}
        {...buttonProps}
      >
        {children}
      </Button>

      <span
        id={noticeId}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: t.space(1.5),
          background: t.color.grey100,
          border: `1px solid ${t.color.grey200}`,
          borderRadius: t.radius.sm,
          padding: `${t.space(1.5)} ${t.space(2)}`,
          font: `${t.font.size.xs} ${t.font.family}`,
          color: t.color.grey700,
          lineHeight: 1.45,
          maxWidth: 320,
        }}
      >
        {/* Decorative: the adjacent text carries the meaning. */}
        <span aria-hidden="true" style={{ flex: "0 0 auto", opacity: 0.75 }}>
          &#128274;
        </span>
        <span>
          <strong style={{ color: t.color.grey900, fontWeight: t.font.weight.semibold }}>
            {tr("common.unavailable")}
          </strong>{" "}
          {reason}
          {guidance ? ` ${guidance}` : null}
        </span>
      </span>
    </span>
  );
}
