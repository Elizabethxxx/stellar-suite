"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

/**
 * LogRedactor — privacy-by-default redaction for Events and Terminal panels.
 *
 * Logs and trace output frequently contain Stellar secret keys, contract
 * addresses, hashes, JWTs, and other high-entropy material that must not
 * accidentally end up in a screenshot or pasted chat log. This module
 * provides:
 *
 *   - `redactText(input)`           — pure string redactor used by callers
 *     that need to scrub data before handing it to xterm.js (which renders
 *     to canvas and is therefore not affected by the React tree).
 *   - `<RedactedText text=... />`   — UI primitive that renders text with
 *     sensitive substrings replaced by `█████` placeholders. Subscribes
 *     to the global redaction mode so toggling Unredact reveals every
 *     RedactedText at once.
 *   - `<RedactionProvider>`         — global redaction-mode context.
 *   - `<RedactionToggle />`         — header button that flips the mode
 *     and gates "Unredact" behind a confirmation dialog.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pure redaction engine
// ─────────────────────────────────────────────────────────────────────────────

export interface RedactionRule {
  name: string;
  /** Must be a global regex; we replace every match. */
  pattern: RegExp;
  /** Optional custom replacement; defaults to a `█` block sized like the match. */
  replace?: (match: string) => string;
}

const defaultBlock = (match: string): string => {
  const preview = match.length > 8 ? `${match.slice(0, 2)}…${match.slice(-2)}` : "";
  const blocks = "█".repeat(Math.min(8, Math.max(4, Math.floor(match.length / 8))));
  return preview ? `${preview.slice(0, 2)}${blocks}${preview.slice(-2)}` : blocks;
};

/**
 * Built-in rules. Stellar identifiers use base32 (A–Z, 2–7), 56 chars total
 * with a known leading byte: S=secret, G=public, C=contract, M=muxed.
 * Hex/base64/JWT cover most other secret-shaped material that lands in
 * traces.
 */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  {
    name: "stellar-secret",
    pattern: /\bS[A-Z2-7]{55}\b/g,
    replace: () => "S██████████████████████████████████████████████████████",
  },
  {
    name: "stellar-public",
    pattern: /\bG[A-Z2-7]{55}\b/g,
  },
  {
    name: "stellar-contract",
    pattern: /\bC[A-Z2-7]{55}\b/g,
  },
  {
    name: "stellar-muxed",
    pattern: /\bM[A-Z2-7]{68}\b/g,
  },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => "eyJ…████████.████████.████████",
  },
  {
    // 32+ char hex blobs — hashes, signatures, raw key material
    name: "long-hex",
    pattern: /\b(?:0x)?[0-9a-fA-F]{32,}\b/g,
  },
  {
    // High-entropy base64 / base64url, 24+ chars. Trailing `=` optional.
    name: "long-base64",
    pattern: /\b[A-Za-z0-9+/_-]{24,}={0,2}\b/g,
  },
];

/**
 * Apply every rule to `input`, returning the redacted string. Order matters:
 * Stellar identifiers run first so their tight character class wins over the
 * more permissive base64 / hex rules.
 */
export function redactText(
  input: string,
  rules: RedactionRule[] = DEFAULT_REDACTION_RULES,
): string {
  if (!input) return input;
  let out = input;
  for (const rule of rules) {
    out = out.replace(rule.pattern, (match) =>
      rule.replace ? rule.replace(match) : defaultBlock(match),
    );
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// React context
// ─────────────────────────────────────────────────────────────────────────────

interface RedactionContextValue {
  /** When true, sensitive substrings render as placeholders. Default: true. */
  redacted: boolean;
  /** Switch to revealed mode. Callers should already have gathered consent. */
  unredact: () => void;
  /** Switch back to redacted mode. Safe to call from anywhere. */
  redact: () => void;
}

const RedactionContext = createContext<RedactionContextValue | null>(null);

export function RedactionProvider({ children }: { children: ReactNode }) {
  const [redacted, setRedacted] = useState(true);

  // If the user navigated away or the tab was hidden, snap back to redacted —
  // a stale "revealed" state could otherwise leak into a screenshot taken
  // after the user thought they had locked it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setRedacted(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const value = useMemo<RedactionContextValue>(
    () => ({
      redacted,
      unredact: () => setRedacted(false),
      redact: () => setRedacted(true),
    }),
    [redacted],
  );

  return <RedactionContext.Provider value={value}>{children}</RedactionContext.Provider>;
}

export function useRedaction(): RedactionContextValue {
  const ctx = useContext(RedactionContext);
  if (ctx) return ctx;
  // Outside a provider we fail closed: always redact, and ignore unredact attempts.
  return { redacted: true, unredact: () => undefined, redact: () => undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────────

interface RedactedTextProps {
  text: string;
  /** Override rule set for this instance, e.g. add a project-specific pattern. */
  rules?: RedactionRule[];
  className?: string;
  /** Render as a span (inline) or a div (block). */
  as?: "span" | "div" | "pre";
}

export function RedactedText({ text, rules, className, as = "span" }: RedactedTextProps) {
  const { redacted } = useRedaction();
  const displayed = redacted ? redactText(text, rules) : text;
  const Tag = as;
  // We intentionally do NOT add `title={text}` — hover-revealing the original
  // would defeat the screenshot-safety guarantee.
  return <Tag className={className}>{displayed}</Tag>;
}

interface RedactionToggleProps {
  /** Visual size variant. */
  size?: "sm" | "md";
  /** Optional label override; defaults to "Redacted" / "Visible". */
  className?: string;
}

export function RedactionToggle({ size = "sm", className = "" }: RedactionToggleProps) {
  const { redacted, unredact, redact } = useRedaction();
  const [confirming, setConfirming] = useState(false);

  const onClick = useCallback(() => {
    if (redacted) {
      setConfirming(true);
    } else {
      redact();
    }
  }, [redacted, redact]);

  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!redacted}
        aria-label={redacted ? "Reveal redacted content" : "Hide sensitive content"}
        title={
          redacted
            ? "Sensitive values are hidden. Click to unredact (requires confirmation)."
            : "Sensitive values are visible. Click to redact."
        }
        className={`inline-flex items-center gap-1 rounded border font-mono uppercase tracking-wider transition-colors ${padding} ${
          redacted
            ? "border-white/15 bg-white/5 text-white/60 hover:bg-white/10"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
        } ${className}`}
      >
        {redacted ? (
          <>
            <EyeOff aria-hidden="true" className="h-3 w-3" />
            <span>Redacted</span>
          </>
        ) : (
          <>
            <Eye aria-hidden="true" className="h-3 w-3" />
            <span>Visible</span>
          </>
        )}
      </button>

      {confirming && (
        <UnredactConfirmDialog
          onConfirm={() => {
            unredact();
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function UnredactConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Escape key cancels — common modal convention.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unredact-confirm-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-amber-500/30 bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3 mb-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 id="unredact-confirm-title" className="text-sm font-semibold text-foreground">
              Reveal sensitive log content?
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Secret keys, addresses, and other high-entropy values will be shown in plain
              text. Be careful when sharing your screen, screenshots, or recordings.
            </p>
          </div>
        </div>

        <ul className="mb-4 list-disc pl-5 text-[11px] text-muted-foreground space-y-0.5">
          <li>Anyone watching your screen will see the unredacted values.</li>
          <li>Switching tabs or hiding the window automatically re-redacts.</li>
        </ul>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 transition-colors font-medium"
          >
            Reveal anyway
          </button>
        </div>
      </div>
    </div>
  );
}
