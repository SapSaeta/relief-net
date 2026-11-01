import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { isProvider } from "@/lib/llm";
import { runMatching } from "@/lib/match";

// POST { provider?: "meta" | "baseten" }: the matching agent proposes volunteers and supplies for
// the latest triage queue. Proposals only: nothing is dispatched without the coordinator.

export const maxDuration = 300;

export async function POST(request: Request) {
  return withPaidCall(request, COST_ESTIMATE_USD.match, () => match(request));
}

async function match(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { provider?: unknown };
  if (body.provider !== undefined && !isProvider(body.provider)) {
    return Response.json({ error: "provider must be meta or baseten" }, { status: 400 });
  }
  try {
    return Response.json(await runMatching(body.provider));
  } catch (error) {
    console.error("matching failed", error);
    const known = error instanceof Error && /triage/i.test(error.message);
    return Response.json({ error: known ? (error as Error).message : "Matching failed. Please try again in a minute." }, { status: known ? 409 : 502 });
  }
}
