import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { isProvider } from "@/lib/llm";
import { runTriage } from "@/lib/triage";

// POST { provider?: "meta" | "baseten" }: dedupe and prioritize every open request.

export const maxDuration = 300;

export async function POST(request: Request) {
  return withPaidCall(request, COST_ESTIMATE_USD.triage, () => triage(request));
}

async function triage(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { provider?: unknown };
  if (body.provider !== undefined && !isProvider(body.provider)) {
    return Response.json({ error: "provider must be meta or baseten" }, { status: 400 });
  }
  try {
    return Response.json(await runTriage(body.provider));
  } catch (error) {
    console.error("triage failed", error);
    return Response.json({ error: "Triage failed. Please try again in a minute." }, { status: 502 });
  }
}
