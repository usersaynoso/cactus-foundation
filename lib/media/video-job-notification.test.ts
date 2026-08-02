import { describe, it, expect } from 'vitest'
import {
  parseVideoJobNotification,
  videoJobTitle,
  videoNameFromTitle,
  type VideoJobState,
} from './video-job-notification'

// A job has no table of its own: its state lives in the title of the one
// notification that carries it, and its progress in reasons[0]. So the writer
// (upsertVideoJobNotification) and the readers (the bell, the notifications page,
// the Media > Video panel) only agree for as long as the title round-trips -
// which is what this checks.

const STATES: VideoJobState[] = ['queued', 'running', 'done', 'error']

function row(title: string, label?: string, detail?: string) {
  return {
    dedupeKey: 'video-job:mach123:abc',
    title,
    reasons: label || detail ? [{ label, detail, at: '2026-08-02T00:00:00.000Z' }] : [],
  }
}

describe('video job notifications', () => {
  it('round-trips every state through the title', () => {
    for (const state of STATES) {
      const title = videoJobTitle('Eclipse Plus demo', state)
      expect(videoNameFromTitle(title)).toBe('Eclipse Plus demo')
      const parsed = parseVideoJobNotification(row(title))
      expect(parsed).not.toBeNull()
      // 'queued' and 'running' share a title; the finer state comes off the
      // label, which a bare title cannot supply - so both read as queued here.
      expect(parsed?.state).toBe(state === 'running' ? 'queued' : state)
    }
  })

  it('reads running off the label, and the percentage off the detail', () => {
    const parsed = parseVideoJobNotification(
      row(videoJobTitle('Storm chair', 'running'), 'Encoding', '42%'),
    )
    expect(parsed).toMatchObject({ state: 'running', progress: 42, name: 'Storm chair' })
  })

  it('keeps the job ref intact, machine prefix and all', () => {
    // The ref is what the status poll routes on: lose the machine half and the
    // poll lands on whichever machine Fly fancies, which answers 404.
    const parsed = parseVideoJobNotification(row(videoJobTitle('Ace', 'queued')))
    expect(parsed?.jobId).toBe('mach123:abc')
  })

  it('ignores a notification that is neither', () => {
    expect(parseVideoJobNotification({ dedupeKey: 'module-update:shop', title: 'Update available' })).toBeNull()
    // A leftover notification from the scroll-sequence converter that used to
    // live here is somebody else's business now: it is not a video job.
    expect(parseVideoJobNotification({ dedupeKey: 'sequence-job:old', title: 'Scroll sequence in progress: Ace' })).toBeNull()
    expect(parseVideoJobNotification({ dedupeKey: null, title: 'Anything' })).toBeNull()
  })
})
