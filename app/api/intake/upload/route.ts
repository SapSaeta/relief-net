import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { blobUploadsEnabled, MAX_VIDEO_BYTES, UPLOAD_PREFIX, VIDEO_TYPES } from "@/lib/blob";
import { checkAccessCode } from "@/lib/guard";

// Issues short-lived client tokens so the browser uploads an intake video straight to Vercel Blob.
// Requires the access code; the token only allows a private MP4/MOV of up to 200 MB under intake/.
// No model is called here: the spend guard applies when /api/intake processes the blob.

export async function POST(request: Request) {
  if (!blobUploadsEnabled()) return Response.json({ error: "Blob uploads are not configured" }, { status: 404 });
  const denied = checkAccessCode(request.headers.get("x-access-code"));
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Invalid upload request" }, { status: 400 });

  try {
    return Response.json(
      await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(UPLOAD_PREFIX)) throw new Error("Uploads go under intake/");
          return {
            allowedContentTypes: VIDEO_TYPES,
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 5 * 60 * 1000,
          };
        },
      }),
    );
  } catch (error) {
    console.error("blob token failed", error);
    return Response.json({ error: "Upload could not be authorized" }, { status: 400 });
  }
}
