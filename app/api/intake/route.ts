import { writeFile } from "node:fs/promises";

import { deleteIntakeBlob, downloadIntakeBlob, isIntakePathname, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/blob";
import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { runIntake } from "@/lib/intake";

// Two ways in, same pipeline (upload, transcription, damage segmentation, help request):
//   - local: multipart/form-data with a `video` field (MP4 or MOV) and an optional `location`;
//   - production: JSON { blobPathname, location? } after the browser uploaded the video to Vercel Blob
//     (see /api/intake/upload). The blob is deleted whether the pipeline succeeds or not.

export const maxDuration = 300;

export async function POST(request: Request) {
  return withPaidCall(request, COST_ESTIMATE_USD.intake, () =>
    request.headers.get("content-type")?.includes("application/json") ? fromBlob(request) : fromForm(request),
  );
}

const cleanLocation = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 200) || undefined : undefined);

async function fromForm(request: Request) {
  const form = await request.formData();
  const video = form.get("video");

  if (!(video instanceof File)) {
    return Response.json({ error: "Missing `video` file field" }, { status: 400 });
  }
  if (!VIDEO_TYPES.includes(video.type)) {
    return Response.json({ error: `Unsupported type ${video.type || "unknown"}: use MP4 or MOV` }, { status: 415 });
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return Response.json({ error: "Video is larger than 200 MB" }, { status: 413 });
  }
  return run(async (path) => writeFile(path, Buffer.from(await video.arrayBuffer())), cleanLocation(form.get("location")));
}

async function fromBlob(request: Request) {
  const body = (await request.json().catch(() => null)) as { blobPathname?: unknown; location?: unknown } | null;
  const pathname = typeof body?.blobPathname === "string" ? body.blobPathname : "";
  if (!isIntakePathname(pathname)) return Response.json({ error: "Expected { blobPathname } from /api/intake/upload" }, { status: 400 });
  try {
    return await run((path) => downloadIntakeBlob(pathname, path), cleanLocation(body?.location));
  } finally {
    await deleteIntakeBlob(pathname);
  }
}

async function run(writeVideo: (path: string) => Promise<void>, location?: string) {
  try {
    return Response.json(await runIntake(writeVideo, location));
  } catch (error) {
    console.error("intake failed", error);
    // Upstream error text stays in the server log.
    return Response.json({ error: "Intake failed. Please try again in a minute." }, { status: 502 });
  }
}
