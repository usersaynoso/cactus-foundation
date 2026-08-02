'use client'

import { useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import VideoSettingsPanel from './VideoSettingsPanel'

// Thin tab shell over the media page: the existing library on one tab, the video
// service settings (the Fly key + the job list) on another. The library is a big
// stateful client tree, so both tabs stay mounted and the inactive one is just
// hidden - switching tabs never tears the library's selection or scroll down.

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

type Tab = 'library' | 'video'

export default function MediaTabs({
  library,
  fly,
  jobs,
  canManageSettings,
}: {
  /** The existing library view (server-rendered), shown on the first tab. */
  library: ReactNode
  fly: FlyMeta
  jobs: Job[]
  canManageSettings: boolean
}) {
  const [tab, setTab] = useState<Tab>('library')

  return (
    <>
      <TabStrip
        items={[
          { key: 'library', label: 'Library', active: tab === 'library', onClick: () => setTab('library') },
          { key: 'video', label: 'Video', active: tab === 'video', onClick: () => setTab('video') },
        ]}
      />
      <div hidden={tab !== 'library'}>{library}</div>
      {tab === 'video' && (
        <VideoSettingsPanel initialFly={fly} initialJobs={jobs} canManage={canManageSettings} />
      )}
    </>
  )
}
