'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { setUrlParams } from '@/lib/admin/tab-url'
import VideoSettingsPanel from './VideoSettingsPanel'

// Thin tab shell over the media page: the existing library on one tab, the video
// service settings (the Fly key + the job list) on another. The library is a big
// stateful client tree, so both tabs stay mounted and the inactive one is just
// hidden - switching tabs never tears the library's selection or scroll down.
//
// Modules that own a media-adjacent tool (e.g. the watermark remover) add their
// own tab here through the `core.media-tabs` point rather than taking a sidebar
// link of their own. Their panels are resolved server-side and arrive as nodes.

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

/** A tab a module contributed through `core.media-tabs`, already permission-gated. */
export type MediaModuleTab = { id: string; label: string; node: ReactNode }

export default function MediaTabs({
  library,
  fly,
  jobs,
  canManageSettings,
  moduleTabs = [],
}: {
  /** The existing library view (server-rendered), shown on the first tab. */
  library: ReactNode
  fly: FlyMeta
  jobs: Job[]
  canManageSettings: boolean
  moduleTabs?: MediaModuleTab[]
}) {
  // Built-in keys plus whatever module ids arrive, so the state is a plain string.
  const [tab, setTab] = useState<string>('library')

  // Pick the tab out of the URL after mount, so a refresh stays where the admin
  // was. After mount rather than during render, so the server-rendered markup and
  // the first client render still agree. The library's own ?folder= bookkeeping
  // lives alongside this and neither touches the other's key.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the URL's tab on mount
    if (t && (t === 'video' || moduleTabs.some((m) => m.id === t))) setTab(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; the module tab list is fixed for the render
  }, [])

  // Library is the default, so it carries no param.
  const selectTab = useCallback((next: string) => {
    setTab(next)
    setUrlParams({ tab: next === 'library' ? null : next })
  }, [])

  const activeModuleTab = moduleTabs.find((t) => t.id === tab) ?? null

  return (
    <>
      <TabStrip
        items={[
          { key: 'library', label: 'Library', active: tab === 'library', onClick: () => selectTab('library') },
          { key: 'video', label: 'Video', active: tab === 'video', onClick: () => selectTab('video') },
          ...moduleTabs.map((t) => ({ key: t.id, label: t.label, active: tab === t.id, onClick: () => selectTab(t.id) })),
        ]}
      />
      <div hidden={tab !== 'library'}>{library}</div>
      {tab === 'video' && (
        <VideoSettingsPanel initialFly={fly} initialJobs={jobs} canManage={canManageSettings} />
      )}
      {activeModuleTab?.node}
    </>
  )
}
