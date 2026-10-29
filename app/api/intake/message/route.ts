import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { runMessageIntake } from "@/lib/intake";

// POST JSON { message, location?, receivedAt? }: a help request typed instead of filmed.

export const maxDuration = 120;

const MAX_CHARS = 2000;

export async function POST(request: Request) {
  return withPaidCall(request, COST_ESTIMATE_USD.message, () => intake(request));
}

async function intake(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown; location?: unknown; receivedAt?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.split(/\s+/).length < 3) return Response.json({ error: "Describe the situation in a few words" }, { status: 400 });
  if (message.length > MAX_CHARS) return Response.json({ error: `Message is longer than ${MAX_CHARS} characters` }, { status: 413 });
  const location = typeof body?.location === "string" ? body.location.trim().slice(0, 200) || undefined : undefined;
  // Accepted for seeding a synthetic scenario; never in the future.
  const receivedAt =
    typeof body?.receivedAt === "string" && !Number.isNaN(Date.parse(body.receivedAt)) && Date.parse(body.receivedAt) <= Date.now()
      ? new Date(body.receivedAt).toISOString()
      : undefined;

  try {
    return Response.json(await runMessageIntake({ message, location, receivedAt }));
  } catch (error) {
    console.error("message intake failed", error);
    return Response.json({ error: "Intake failed. Please try again in a minute." }, { status: 502 });
  }
}
