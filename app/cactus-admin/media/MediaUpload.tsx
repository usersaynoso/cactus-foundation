'use client'

import { useRef } from 'react'
import { UPLOAD_ACCEPT_ATTR } from '@/lib/media/limits'

// Header upload trigger. It no longer uploads itself - it just picks files and
// hands them to the library, which owns the shared upload queue (progress,
// per-file status). Showing the destination folder makes it obvious where the
// files will land before you pick them.
export default function MediaUpload({
  destinationLabel,
  onFiles,
}: {
  /** Name of the folder new uploads land in, shown on the button. */
  destinationLabel: string
  onFiles: (files: FileList) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={UPLOAD_ACCEPT_ATTR}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files)
          e.target.value = '' // let the same file be re-picked
        }}
      />
      <button className="btn btn-primary" onClick={() => ref.current?.click()} title={`Upload to ${destinationLabel}`}>
        + Upload to {destinationLabel}
      </button>
    </div>
  )
}
