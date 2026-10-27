import { loadCase, saveCase } from "@/lib/cases";
import { draftHelpRequest } from "@/lib/request";
import { UsageLedger } from "@/lib/usage";

// Re-drafts the help request of a stored case (no new upload, transcription or SAM calls).

export const maxDuration = 120;

export async function POST(_request: Request, ctx: RouteContext<"/api/cases/[id]/request">) {
  const { id } = await ctx.params;
  const intake = await loadCase(id);
  if (!intake) return Response.json({ error: "Case not found" }, { status: 404 });

  const ledger = new UsageLedger(id);
  try {
    const request = await draftHelpRequest(
      { fileId: intake.fileId, transcript: intake.transcript, frames: intake.frames },
      ledger,
    );
    const updated = {
      ...intake,
      request,
      requestError: undefined,
      usage: [...(intake.usage ?? []), ...ledger.entries],
      costUsd: (intake.costUsd ?? 0) + ledger.totalUsd,
    };
    await saveCase(updated);
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Help request failed" }, { status: 502 });
  } finally {
    await ledger.flush();
  }
}
