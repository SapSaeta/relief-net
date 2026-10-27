import { loadCase, saveCase } from "@/lib/cases";
import { COST_ESTIMATE_USD, guardPaidCall } from "@/lib/guard";
import { draftHelpRequest } from "@/lib/request";
import { UsageLedger } from "@/lib/usage";

// Re-drafts the help request of a stored case (no new upload, transcription or SAM calls).

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/request">) {
  const denied = await guardPaidCall(request, COST_ESTIMATE_USD.request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const intake = await loadCase(id);
  if (!intake) return Response.json({ error: "Case not found" }, { status: 404 });

  const ledger = new UsageLedger(id);
  try {
    const drafted = await draftHelpRequest(
      { fileId: intake.fileId, transcript: intake.transcript, frames: intake.frames },
      ledger,
    );
    const updated = {
      ...intake,
      request: drafted,
      requestError: undefined,
      usage: [...(intake.usage ?? []), ...ledger.entries],
      costUsd: (intake.costUsd ?? 0) + ledger.totalUsd,
    };
    await saveCase(updated);
    return Response.json(updated);
  } catch (error) {
    console.error("help request failed", error);
    return Response.json({ error: "Help request failed. Please try again in a minute." }, { status: 502 });
  } finally {
    await ledger.flush();
  }
}
