import { COST_ESTIMATE_USD, guardPaidCall } from "@/lib/guard";
import { isProvider } from "@/lib/llm";
import { runTriage } from "@/lib/triage";

// POST { provider?: "meta" | "baseten" }: dedupe and prioritize every open request.

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await guardPaidCall(request, COST_ESTIMATE_USD.triage);
  if (denied) return denied;

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
