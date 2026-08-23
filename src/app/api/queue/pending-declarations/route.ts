import { listResponse } from "@/lib/api/responses";
import { listQueueItems } from "@/lib/queue/store";

export const dynamic = "force-dynamic";

/**
 * What a fresh KB run fetches: items with a declaration and no outcome —
 * each with the verbatim proposal snapshot (for the material comparison)
 * and the effective declaration (latest stated_at; earlier ones superseded).
 * Consuming is recorded by POSTing an outcome; nothing here mutates state.
 */
export async function GET() {
  const declared = await listQueueItems({ status: "DECLARED" });
  return listResponse(declared, { page: 1, pageSize: declared.length, total: declared.length });
}
