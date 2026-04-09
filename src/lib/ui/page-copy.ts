export interface DataPageCopy {
  title: string;
  subtitle: string;
  nextAction: string;
}

export const dataPageCopy: Record<string, DataPageCopy> = {
  overview: {
    title: "Overview",
    subtitle: "Portfolio summary, import quality, and account snapshots.",
    nextAction: "Upload a thinkorswim statement in Imports & Connections.",
  },
  imports: {
    title: "Imports & Connections",
    subtitle: "Upload statements, inspect previews, and commit results.",
    nextAction: "Select Upload Statement to start a new import.",
  },
  executions: {
    title: "Executions",
    subtitle: "Canonical execution table with broker and account context.",
    nextAction: "Commit an import to generate execution rows.",
  },
  matchedLots: {
    title: "Matched Lots",
    subtitle: "FIFO open/close matching with realized P&L and holding periods.",
    nextAction: "Run matching after imports are persisted.",
  },
  setups: {
    title: "Setups",
    subtitle: "Setup-level analytics grouped from matched lots.",
    nextAction: "Generate setup groups from matched lots.",
  },
  ttsEvidence: {
    title: "TTS Evidence",
    subtitle: "Evidence and readiness metrics from historical trading activity.",
    nextAction: "Load matched lot history to compute evidence metrics.",
  },
  diagnostics: {
    title: "Diagnostics",
    subtitle: "Parser, matcher, and setup-inference diagnostic metrics.",
    nextAction: "Run imports and matching to populate diagnostics.",
  },
};
