import "server-only";

import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { del, get } from "@vercel/blob";

// Vercel Blob is used for one thing: carrying an intake video from the browser to the server in
// production, where function request bodies are capped at ~4.5 MB. Blobs are private, live under
// intake/ and are deleted as soon as the pipeline has read them. Locally (no BLOB_READ_WRITE_TOKEN)
// the browser keeps uploading multipart straight to /api/intake.

export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const UPLOAD_PREFIX = "intake/";

export const blobUploadsEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Only pathnames this app issued tokens for: no URLs, so nothing outside our store is fetched. */
export const isIntakePathname = (pathname: string) => /^intake\/[\w.-]{1,200}$/.test(pathname) && !pathname.includes("..");

/** Streams a private intake blob to `dest`, checking type and size again on the way in. */
export async function downloadIntakeBlob(pathname: string, dest: string): Promise<void> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("Uploaded video not found");
  if (!VIDEO_TYPES.includes(result.blob.contentType) || result.blob.size > MAX_VIDEO_BYTES) {
    throw new Error("Uploaded blob is not an accepted video");
  }
  await pipeline(Readable.fromWeb(result.stream as unknown as WebReadableStream), createWriteStream(dest));
}

export async function deleteIntakeBlob(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch (error) {
    console.error("could not delete intake blob", error);
  }
}
