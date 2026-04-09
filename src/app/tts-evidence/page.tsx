import { DataPageLayout } from "@/components/data-page-layout";
import { TtsEvidencePanel } from "@/components/tts-evidence-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

export default function Page() {
  const page = dataPageCopy.ttsEvidence;

  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <TtsEvidencePanel />
    </div>
  );
}
