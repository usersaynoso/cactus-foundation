'use client'

import { useState, useEffect, useCallback } from 'react'
import { createUsePuck } from '@puckeditor/core'

const usePuck = createUsePuck()

type SavedBlock = {
  id: string
  name: string
  componentType: string
  data: { type: string; props: Record<string, unknown> }
}

const ROOT_ZONE = 'default-zone'

export default function SavedBlocksTab() {
  const appState = usePuck(s => s.appState)
  const dispatch = usePuck(s => s.dispatch)
  const selectedItem = usePuck(s => s.selectedItem)
  const [blocks, setBlocks] = useState<SavedBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/saved-blocks')
      .then((r) => r.json())
      .then((d) => setBlocks(d.blocks ?? []))
      .catch(() => setError('Failed to load saved blocks'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async saved-blocks load on mount; setLoading(false) only fires after awaits
    load()
  }, [load])

  async function saveSelected() {
    if (!selectedItem) return
    const name = prompt('Name this block?')
    if (!name) return
    setError('')
    try {
      const res = await fetch('/api/admin/saved-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, componentType: selectedItem.type, data: selectedItem }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save block'); return }
      load()
    } catch {
      setError('Failed to save block')
    }
  }

  function insertBlock(block: SavedBlock) {
    const id = `${block.componentType}-${crypto.randomUUID()}`
    const destinationIndex = appState.data.content?.length ?? 0

    dispatch({
      type: 'insert',
      componentType: block.componentType,
      destinationIndex,
      destinationZone: ROOT_ZONE,
      id,
    } as never)

    dispatch({
      type: 'replace',
      destinationZone: ROOT_ZONE,
      destinationIndex,
      data: { ...block.data, props: { ...block.data.props, id } },
    })
  }

  async function deleteBlock(id: string) {
    if (!confirm('Delete this saved block?')) return
    try {
      const res = await fetch(`/api/admin/saved-blocks/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to delete block'); return }
      setBlocks((b) => b.filter((x) => x.id !== id))
    } catch {
      setError('Failed to delete block')
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Saved blocks
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', fontSize: '0.8125rem', marginBottom: '0.75rem' }}
        disabled={!selectedItem}
        onClick={saveSelected}
      >
        {selectedItem ? `Save selected (${selectedItem.type})` : 'Select a block to save'}
      </button>

      {error && <p style={{ fontSize: '0.8125rem', color: 'var(--color-destructive)' }}>{error}</p>}
      {loading && <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading…</p>}
      {!loading && blocks.length === 0 && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>No saved blocks yet.</p>
      )}

      {blocks.map((block) => (
        <div
          key={block.id}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{block.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{block.componentType}</div>
          </div>
          <button
            onClick={() => insertBlock(block)}
            style={{ padding: '0.2rem 0.6rem', borderRadius: 4, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Insert
          </button>
          <button
            onClick={() => deleteBlock(block.id)}
            style={{ padding: '0.2rem 0.5rem', background: 'none', border: 'none', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.875rem', lineHeight: 1 }}
            title="Delete"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
