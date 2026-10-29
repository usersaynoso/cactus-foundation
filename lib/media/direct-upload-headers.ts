// Headers a browser (or a render worker) sends with a direct upload PUT, from the
// target the site handed out. Client-safe: no imports.
//
// A Worker target wants the upload token as a bearer. A presigned bucket target
// (direct serving mode, lib/media/serving-mode.ts) already carries its authority
// in the query string, and S3 refuses a request carrying two kinds of
// authentication, so it gets the content type alone - which must be exactly the
// one it was signed for.

export type DirectUploadTargetShape = { token: string; presigned?: boolean }

export function directUploadHeaders(target: DirectUploadTargetShape, contentType: string): Record<string, string> {
  return target.presigned
    ? { 'content-type': contentType }
    : { 'content-type': contentType, authorization: `Bearer ${target.token}` }
}
