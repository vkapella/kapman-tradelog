export interface DataPageCopy {
  title: string;
  subtitle: string;
  nextAction: string;
}

export const dataPageCopy: Record<string, DataPageCopy> = {
  overview: {
    title: "OverviewPage",
    subtitle: "Placeholder overview summary while ingestion and analytics are implemented.",
    nextAction: "Upload a thinkorswim statement in Imports & Connections.",
  },
  imports: {
    title: "ImportsConnectionsPage",
    subtitle: "Placeholder import workflow surface.",
    nextAction: "Select Upload Statement to start a new import.",
  },
  executions: {
    title: "ExecutionsPage",
    subtitle: "Placeholder canonical execution table view.",
    nextAction: "Commit an import to generate execution rows.",
  },
  matchedLots: {
    title: "MatchedLotsPage",
    subtitle: "Placeholder FIFO matched lots view.",
    nextAction: "Run matching after imports are persisted.",
  },
  setups: {
    title: "SetupsPage",
    subtitle: "Placeholder setup analytics view.",
    nextAction: "Generate setup groups from matched lots.",
  },
  ttsEvidence: {
    title: "TtsEvidencePage",
    subtitle: "Placeholder TTS evidence/readiness view.",
    nextAction: "Load matched lot history to compute evidence metrics.",
  },
  diagnostics: {
    title: "DiagnosticsPage",
    subtitle: "Placeholder parser/matcher diagnostics view.",
    nextAction: "Run imports and matching to populate diagnostics.",
  },
};
