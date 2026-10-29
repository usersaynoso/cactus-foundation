// Where a file goes when it is sent straight from the browser (or a worker) to
// storage, skipping the serverless body limit. The one place that decides, so
// core's media library and every module with an upload path of its own agree.
//
//   Worker mode  - `${CLOUDFLARE_WORKER_URL}/<key>`, authorised by the upload
//                  token (lib/media/upload-token.ts) as a bearer.
//   Direct mode  - a presigned PUT on the bucket (lib/media/presign.ts), when the
//                  owner serves this provider straight from the bucket.
//
// Callers still sign an upload token for the key and check it when the upload is
// recorded: in Worker mode the Worker checks it too, in direct mode it is what
// ties the recorded row to a key this site chose.
//
// Send the PUT with directUploadHeaders() (lib/media/direct-upload-headers.ts).

import type { MediaProviderType } from '@prisma/client'
import { isS3Provider } from '@/lib/media/s3-config'
import { servesDirect } from '@/lib/media/serving-mode'
import { workerUrl } from '@/lib/media/worker-url'
import { presignMediaUpload } from '@/lib/media/presign'

export type DirectUploadTarget = {
  uploadUrl: string
  /** True for a presigned bucket url: send no Authorization header. */
  presigned: boolean
}

/** Whether `provider` can take a direct upload on this install right now. */
export function canTakeDirectUpload(provider: MediaProviderType): boolean {
  if (!isS3Provider(provider)) return false
  return servesDirect(provider) || !!workerUrl()
}

/**
 * The PUT target for `key`, or null when this provider cannot take a direct
 * upload here (not S3-style, or Worker mode with no Worker).
 *
 * `sizeBytes`, when known, is signed into a presigned url so the bucket refuses
 * any other length - the job the Worker's own ceiling does in Worker mode. Pass it
 * whenever the size is known; a caller that cannot know it (a render worker that
 * has not drawn the picture yet) must check the stored size once it has landed.
 */
export async function directUploadTarget(
  provider: MediaProviderType,
  key: string,
  contentType: string,
  sizeBytes?: number,
): Promise<DirectUploadTarget | null> {
  if (!canTakeDirectUpload(provider)) return null
  if (servesDirect(provider)) {
    const size = typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : undefined
    return { uploadUrl: await presignMediaUpload(provider, key, contentType, size), presigned: true }
  }
  return { uploadUrl: `${workerUrl()}/${key}`, presigned: false }
}
