import { DataPagePanel } from "@/components/data-page-panel";

interface DataPageLayoutProps {
  title: string;
  subtitle: string;
  nextAction: string;
}

export function DataPageLayout({ title, subtitle, nextAction }: DataPageLayoutProps) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        <p className="max-w-3xl text-sm text-slate-300">{subtitle}</p>
      </header>
      <DataPagePanel heading={subtitle} nextAction={nextAction} />
    </section>
  );
}
