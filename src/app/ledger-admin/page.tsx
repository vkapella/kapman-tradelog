import Link from "next/link";
import { AccountsManager } from "@/components/accounts/AccountsManager";
import { AdjustmentsTab } from "@/components/adjustments/AdjustmentsTab";

type TabKey = "accounts" | "adjustments";

function resolveTab(value: string | string[] | undefined): TabKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "adjustments" ? "adjustments" : "accounts";
}

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const activeTab = resolveTab(searchParams?.tab);

  return (
    <section className="space-y-4">
      <div className="border-b border-border">
        <nav className="flex items-center gap-6">
          <Link
            href="/ledger-admin?tab=accounts"
            className={`border-b-2 px-1 py-2 text-sm ${
              activeTab === "accounts" ? "border-[color:var(--accent)] font-semibold text-text" : "border-transparent text-text-3"
            }`}
          >
            Accounts
          </Link>
          <Link
            href="/ledger-admin?tab=adjustments"
            className={`border-b-2 px-1 py-2 text-sm ${
              activeTab === "adjustments" ? "border-[color:var(--accent)] font-semibold text-text" : "border-transparent text-text-3"
            }`}
          >
            Adjustments
          </Link>
        </nav>
      </div>

      {activeTab === "accounts" ? <AccountsManager /> : <AdjustmentsTab />}
    </section>
  );
}
