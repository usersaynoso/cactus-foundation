'use client'

import { useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import SequenceSettingsPanel from './SequenceSettingsPanel'

// Thin tab shell over the media page: the existing library on one tab, the
// scroll-sequence settings (presets + job list) on another. The library is a big
// stateful client tree, so both tabs stay mounted and the inactive one is just
// hidden - switching tabs never tears the library's selection or scroll down.

type Settings = { fps: number; maxWidth: number }
type FlyMeta = { source: 'saved' | 'env' | null; configured: boolean; appName: string | null }

type JobState = 'queued' | 'running' | 'done' | 'error'
type Job = {
  id: string
  jobId: string
  name: string
  state: JobState
  progress: number | null
  detail: string | null
  updatedAt: string
  createdAt: string
}

type Tab = 'library' | 'sequences'

export default function MediaTabs({
  library,
  settings,
  fly,
  jobs,
  canManagePresets,
}: {
  /** The existing library view (server-rendered), shown on the first tab. */
  library: ReactNode
  settings: Settings
  fly: FlyMeta
  jobs: Job[]
  canManagePresets: boolean
}) {
  const [tab, setTab] = useState<Tab>('library')

  return (
    <>
      <TabStrip
        items={[
          { key: 'library', label: 'Library', active: tab === 'library', onClick: () => setTab('library') },
          { key: 'sequences', label: 'Scroll sequences', active: tab === 'sequences', onClick: () => setTab('sequences') },
        ]}
      />
      <div hidden={tab !== 'library'}>{library}</div>
      {tab === 'sequences' && (
        <SequenceSettingsPanel initialSettings={settings} initialFly={fly} initialJobs={jobs} canManage={canManagePresets} />
      )}
    </>
  )
}
