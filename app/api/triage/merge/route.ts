import { checkAccessCode } from "@/lib/guard";
import { decideMerge } from "@/lib/triage";

// POST { key, action: "confirm" | "undo" }: the coordinator's decision on a proposed duplicate group.
// No model call, so no spend reservation; it still needs the access code.

export async function POST(request: Request) {
  const denied = checkAccessCode(request.headers.get("x-access-code"));
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { key?: unknown; action?: unknown } | null;
  if (typeof body?.key !== "string" || (body.action !== "confirm" && body.action !== "undo")) {
    return Response.json({ error: "Expected { key, action: confirm | undo }" }, { status: 400 });
  }
  const result = await decideMerge(body.key, body.action);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
