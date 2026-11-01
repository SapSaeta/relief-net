import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { draftReport } from "@/lib/report";

// POST: drafts (or redrafts) the insurance/aid report of a stored case. Text only: no new upload,
// transcription or SAM calls. Needs the access code and goes through the spend guard.

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/report">) {
  return withPaidCall(request, COST_ESTIMATE_USD.report, async () => {
    const { id } = await ctx.params;
    try {
      const result = await draftReport(id);
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result);
    } catch (error) {
      console.error("report failed", error);
      return Response.json({ error: "The report could not be drafted. Please try again in a minute." }, { status: 502 });
    }
  });
}
