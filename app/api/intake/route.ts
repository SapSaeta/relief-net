import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { runIntake } from "@/lib/intake";

// POST multipart/form-data with a `video` field (MP4 or MOV) and an optional `location`.
// Runs upload, transcription and damage segmentation; returns the stored case.

export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = new Set(["video/mp4", "video/quicktime"]);

export async function POST(request: Request) {
  return withPaidCall(request, COST_ESTIMATE_USD.intake, () => intake(request));
}

async function intake(request: Request) {
  const form = await request.formData();
  const video = form.get("video");

  if (!(video instanceof File)) {
    return Response.json({ error: "Missing `video` file field" }, { status: 400 });
  }
  if (!ACCEPTED.has(video.type)) {
    return Response.json({ error: `Unsupported type ${video.type || "unknown"}: use MP4 or MOV` }, { status: 415 });
  }
  if (video.size > MAX_BYTES) {
    return Response.json({ error: "Video is larger than 200 MB" }, { status: 413 });
  }

  try {
    const location = String(form.get("location") ?? "").trim().slice(0, 200) || undefined;
    return Response.json(await runIntake(video, location));
  } catch (error) {
    console.error("intake failed", error);
    // Upstream error text stays in the server log.
    return Response.json({ error: "Intake failed. Please try again in a minute." }, { status: 502 });
  }
}
