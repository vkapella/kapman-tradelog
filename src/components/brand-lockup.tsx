"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@/types/api";

/* UI-3: the standard KapMan lockup (spec §01, decision 05) — 28×28 type-
 * monogram tile (the shipping mark, decision 09), KAPMAN eyebrow in --gold,
 * tool name, and the Fly-fed version chip. The chip renders the product
 * version only; SHA and machine id live in the diagnostics release card. */

let cachedVersion: string | null = null;

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
        cachedVersion = payload.version;
        if (!cancelled) {
          setVersion(payload.version);
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
      <span
        aria-hidden="true"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-border bg-surface-3"
        style={{ color: "var(--gold)", fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 700 }}
      >
        K
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className="uppercase"
          style={{ color: "var(--gold)", fontFamily: "var(--mono)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.22em" }}
        >
          Kapman
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-text">Tradelog</span>
          {version ? (
            <span
              className="flex-none rounded border border-border bg-surface-3 px-1.5 text-text-2"
              style={{ fontFamily: "var(--mono)", fontSize: "10px", lineHeight: "16px" }}
            >
              {version}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
