import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { MediaProviderType } from '@prisma/client'
import { getS3Config, isS3Provider } from '@/lib/media/s3-config'

// One folder of the site's bucket, exactly as the bucket holds it: every folder and
// every file, not just the ones the media library has a row for.
//
// The media library only knows what it uploaded, all of it under the provider's media
// prefix. A bucket also holds things the library never sees - the server's database
// backups beside it, say - and choosing where those go means being able to walk to
// them. So this lists the bucket itself, one level at a time (S3's delimiter listing),
// which costs one request per folder opened however big the bucket is.
//
// S3-style providers only. The others either keep no folders (Cloudinary and ImageKit
// mint ids) or are never somewhere a backup can be copied to.

/** The folder a listing is of, with no leading or trailing slash. "" is the top of the bucket. */
export type StorageFolder = {
  bucket: string
  prefix: string
  folders: Array<{ name: string; prefix: string }>
  files: Array<{ name: string; key: string; sizeBytes: number; lastModified: string | null }>
  /** More than one page of files: the first page is shown, and the folder says so. */
  truncated: boolean
  /**
   * The part of the bucket the media Worker serves to the public: `media/` for every
   * provider (B2 at its top, the rest under `media/<PROVIDER>/`, see mediaKeyPrefix).
   */
  publicPrefix: 'media'
}

const PAGE = 1000

/** A prefix from the browser, tidied, or null when it is not a plain path. */
export function tidyStoragePrefix(raw: string | null): string | null {
  const prefix = (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!prefix) return ''
  if (prefix.split('/').some((p) => p === '' || p === '.' || p === '..')) return null
  return prefix
}

export function canBrowseStorage(provider: MediaProviderType | null | undefined): provider is MediaProviderType {
  return !!provider && isS3Provider(provider)
}

export async function listStorageFolder(provider: MediaProviderType, prefix: string): Promise<StorageFolder> {
  const { client, bucket } = getS3Config(provider)
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix ? `${prefix}/` : undefined,
      Delimiter: '/',
      MaxKeys: PAGE,
    })
  )
  const base = prefix ? `${prefix}/` : ''
  const folders = (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix)
    .filter((p): p is string => typeof p === 'string')
    .map((p) => {
      const clean = p.replace(/\/+$/, '')
      return { name: clean.slice(base.length), prefix: clean }
    })
    .filter((f) => f.name.length > 0)
  const files = (res.Contents ?? [])
    .filter((o) => typeof o.Key === 'string' && o.Key !== base)
    .map((o) => ({
      name: (o.Key as string).slice(base.length),
      key: o.Key as string,
      sizeBytes: o.Size ?? 0,
      lastModified: o.LastModified ? o.LastModified.toISOString() : null,
    }))
  return {
    bucket,
    prefix,
    folders,
    files,
    truncated: res.IsTruncated === true,
    publicPrefix: 'media',
  }
}
