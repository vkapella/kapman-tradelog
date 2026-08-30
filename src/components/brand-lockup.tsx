"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@/types/api";

/* UI-3: the standard KapMan lockup (spec §01) — 28px commissioned mark,
 * KAPMAN eyebrow in --gold, tool name, and the release chip.
 *
 * The chip reads "<fly release> · <short sha>" (owner decision 2026-08-30,
 * pending Design ratification for the siblings — decision 05 currently says
 * product version ONLY, with the SHA reserved for the details panel). The
 * machine id stays in the diagnostics Release card either way. */

let cachedVersion: string | null = null;

/** Chip label: the Fly release number and the build's short SHA — the two
 *  things that identify a deploy. Either alone is still useful; neither is
 *  ever a git-describe path (see scripts/deploy.sh). */
function composeChipLabel(payload: HealthResponse): string | null {
  const release = payload.version && payload.version !== "dev" ? payload.version : null;
  const sha = payload.sha ?? null;
  if (release && sha) {
    return `${release} · ${sha}`;
  }
  return release ?? sha ?? payload.version ?? null;
}

function useReleaseVersion(): string | null {
  const [version, setVersion] = useState<string | null>(cachedVersion);

  useEffect(() => {
    if (cachedVersion !== null) {
      return;
    }
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((payload) => {
        const label = composeChipLabel(payload);
        cachedVersion = label;
        if (!cancelled) {
          setVersion(label);
        }
      })
      .catch(() => {
        /* chip simply stays absent — never "unknown" (decision 06) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}

export function BrandLockup() {
  const version = useReleaseVersion();

  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* The commissioned mark shipped in the handoff bundle (assets/
          kapman-mark.png) and is what the sibling apps render. Decision 09's
          "type monogram is the shipping mark" describes the fallback, not
          this. */}
      <img
        src="/kapman-mark.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="h-7 w-7 flex-none rounded-md"
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className="uppercase"
          style={{ color: "var(--gold)", fontFamily: "var(--mono)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.22em" }}
        >
          Kapman
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="flex-none text-[15px] font-semibold text-text">Tradelog</span>
          {version ? (
            // Bounded and truncating: a version string is external input, and
            // an unbounded chip paints over the header (the v37 defect).
            <span
              className="min-w-0 max-w-[13ch] flex-none overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-surface-3 px-1.5 text-text-2"
              style={{ fontFamily: "var(--mono)", fontSize: "10px", lineHeight: "16px" }}
              title={version}
            >
              {version}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
