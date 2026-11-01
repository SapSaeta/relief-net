import { checkAccessCode } from "@/lib/guard";
import { decideOnAssignment } from "@/lib/match";

// POST { caseId, action: "approve" | "reject", note? }: the coordinator's decision on one proposed
// assignment. Approving is the dispatch (simulated in the demo: no one is contacted). No model call,
// so no spend reservation; it still needs the access code. Every decision goes to the audit log.

export async function POST(request: Request) {
  const denied = checkAccessCode(request.headers.get("x-access-code"));
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { caseId?: unknown; action?: unknown; note?: unknown } | null;
  if (typeof body?.caseId !== "string" || (body.action !== "approve" && body.action !== "reject")) {
    return Response.json({ error: "Expected { caseId, action: approve | reject, note? }" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : undefined;
  const result = await decideOnAssignment(body.caseId, body.action, note);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
