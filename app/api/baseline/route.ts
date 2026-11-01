import { saveManualTriage } from "@/lib/baseline";
import { checkAccessCode } from "@/lib/guard";

// POST { triager, startedAt, durationMs, order, duplicates }: records one timed manual triage.
// No model call; it needs the access code because it writes to the store.

export async function POST(request: Request) {
  const denied = checkAccessCode(request.headers.get("x-access-code"));
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const result = await saveManualTriage({
    triager: body.triager,
    startedAt: body.startedAt,
    durationMs: body.durationMs,
    order: body.order,
    duplicates: body.duplicates,
  });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
