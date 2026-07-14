'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createUsePuck } from '@puckeditor/core'
import {
  ancestorIds,
  buildOutline,
  computeMove,
  flattenOutline,
  indexOutline,
  zoneIsInsideItem,
  type OutlineIndex,
  type OutlineRow,
} from './tree'

const usePuck = createUsePuck()

/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4
/** Hold (ms) before a touch/pen press counts as a drag, so the panel still scrolls on touch. */
const TOUCH_HOLD_MS = 220
/** Hover (ms) over a collapsed container before it opens mid-drag. */
const AUTO_EXPAND_MS = 500
const AUTOSCROLL_EDGE = 36
const AUTOSCROLL_STEP = 10
const INDENT = 12

type DragState = {
  id: string
  zone: string
  index: number
  label: string
}

type DropTarget = {
  zone: string
  insertIndex: number
  /** Container-relative geometry for the insertion line. */
  top: number
  left: number
}

type ItemRow = Extract<OutlineRow, { kind: 'item' }>

/* ---------- canvas bridge: poke the DOM Puck already wired up, no internals imported ---------- */

function canvasElement(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const frame = document.querySelector('#preview-frame')
  const doc = frame instanceof HTMLIFrameElement ? frame.contentDocument : document
  if (!doc) return null
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  return doc.querySelector<HTMLElement>(`[data-puck-component="${escaped}"]`)
}

/** Puck binds mouseover/mouseout on each canvas element to drive its hover overlay. */
function setCanvasHover(id: string, hovering: boolean) {
  canvasElement(id)?.dispatchEvent(new MouseEvent(hovering ? 'mouseover' : 'mouseout', { bubbles: true }))
}

function scrollCanvasTo(id: string) {
  canvasElement(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let current = el?.parentElement ?? null
  while (current) {
    const { overflow, overflowY } = getComputedStyle(current)
    if (/auto|scroll/.test(`${overflow} ${overflowY}`)) return current
    current = current.parentElement
  }
  return null
}

/* ---------- icons, in lucide's style to match the rest of the editor chrome ---------- */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'scaleY(-1)' : undefined, transition: 'transform 100ms ease' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ComponentIcon({ type }: { type: string }) {
  const isText = type === 'Text' || type === 'Heading' || type === 'RichText'
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {isText ? (
        <>
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" x2="15" y1="20" y2="20" />
          <line x1="12" x2="12" y1="4" y2="20" />
        </>
      ) : (
        <>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </>
      )}
    </svg>
  )
}

function GripIcon() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" />
    </svg>
  )
}

/* ---------- component ---------- */

export default function OutlineTree() {
  const appState = usePuck((s) => s.appState)
  const config = usePuck((s) => s.config)
  const dispatch = usePuck((s) => s.dispatch)
  const selectedItem = usePuck((s) => s.selectedItem)

  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const rowsRef = useRef<OutlineRow[]>([])
  const indexRef = useRef<OutlineIndex | null>(null)
  const pendingRef = useRef<{ drag: DragState; x: number; y: number; holdTimer: number | null } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dropRef = useRef<DropTarget | null>(null)
  const draggedRef = useRef(false)
  const autoExpandRef = useRef<{ id: string; timer: number } | null>(null)
  const autoScrollRef = useRef<{ frame: number; delta: number } | null>(null)
  const listeningRef = useRef(false)

  const roots = useMemo(() => buildOutline(appState.data, config), [appState.data, config])
  const index = useMemo(() => indexOutline(roots), [roots])

  const selectedId = selectedItem?.props?.id ? String(selectedItem.props.id) : null
  const selectedPath = useMemo(() => ancestorIds(selectedId, index), [selectedId, index])

  const isExpanded = useCallback(
    (id: string) => expandOverrides[id] ?? selectedPath.has(id),
    [expandOverrides, selectedPath],
  )

  const rows = useMemo(() => flattenOutline(roots, isExpanded), [roots, isExpanded])

  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => { indexRef.current = index }, [index])

  const setExpanded = useCallback((id: string, open: boolean) => {
    setExpandOverrides((prev) => ({ ...prev, [id]: open }))
  }, [])

  /* ---------- drag helpers ---------- */

  const stopAutoScroll = useCallback(() => {
    if (!autoScrollRef.current) return
    cancelAnimationFrame(autoScrollRef.current.frame)
    autoScrollRef.current = null
  }, [])

  const runAutoScroll = useCallback((delta: number) => {
    const scroller = scrollParentOf(containerRef.current)
    if (!scroller) return
    if (autoScrollRef.current) {
      autoScrollRef.current.delta = delta
      return
    }
    const step = () => {
      const current = autoScrollRef.current
      if (!current) return
      scroller.scrollTop += current.delta
      current.frame = requestAnimationFrame(step)
    }
    autoScrollRef.current = { delta, frame: requestAnimationFrame(step) }
  }, [])

  const clearAutoExpand = useCallback(() => {
    if (!autoExpandRef.current) return
    clearTimeout(autoExpandRef.current.timer)
    autoExpandRef.current = null
  }, [])

  /** Hit-test the visible rows and work out where a drop would land. */
  const resolveDrop = useCallback((y: number): DropTarget | null => {
    const dragged = dragRef.current
    const container = containerRef.current
    const outlineIndex = indexRef.current
    if (!dragged || !container || !outlineIndex) return null

    const visible = rowsRef.current
      .map((row) => ({ row, el: rowRefs.current.get(row.key) }))
      .filter((entry): entry is { row: OutlineRow; el: HTMLElement } => Boolean(entry.el))
    if (visible.length === 0) return null

    const first = visible[0]
    const last = visible[visible.length - 1]
    if (!first || !last) return null

    // Above the first row or below the last, clamp to that end rather than losing the target.
    const hit = visible.find(({ el }) => {
      const rect = el.getBoundingClientRect()
      return y >= rect.top && y <= rect.bottom
    }) ?? (y < first.el.getBoundingClientRect().top ? first : last)

    const { row, el } = hit
    const rect = el.getBoundingClientRect()
    const belowMidpoint = y > rect.top + rect.height / 2

    let zone: string
    let insertIndex: number
    let depth: number
    let lineTop: number

    if (row.kind === 'item') {
      const firstChildZone = row.expanded ? row.item.zones[0] : undefined

      if (belowMidpoint && firstChildZone) {
        // Bottom half of an open container reads as "drop inside, as first child".
        zone = firstChildZone.compound
        insertIndex = 0
        depth = row.depth + 2
        lineTop = rect.bottom
      } else {
        zone = row.item.zone
        insertIndex = row.item.index + (belowMidpoint ? 1 : 0)
        depth = row.depth
        lineTop = belowMidpoint ? rect.bottom : rect.top
      }

      // Hovering a shut container for a beat opens it, so nesting stays reachable mid-drag.
      if (row.expandable && !row.expanded) {
        if (autoExpandRef.current?.id !== row.item.id) {
          clearAutoExpand()
          const id = row.item.id
          autoExpandRef.current = { id, timer: window.setTimeout(() => setExpanded(id, true), AUTO_EXPAND_MS) }
        }
      } else {
        clearAutoExpand()
      }
    } else {
      // Zone header or empty-zone placeholder: land as that zone's first child.
      clearAutoExpand()
      zone = row.zone.compound
      insertIndex = 0
      depth = row.kind === 'zone' ? row.depth + 1 : row.depth
      lineTop = rect.bottom
    }

    if (zone === dragged.zone && insertIndex === dragged.index) return null
    if (zoneIsInsideItem(zone, dragged.id, outlineIndex)) return null

    return {
      zone,
      insertIndex,
      top: lineTop - container.getBoundingClientRect().top,
      left: depth * INDENT,
    }
  }, [clearAutoExpand, setExpanded])

  const applyMove = useCallback((
    source: { zone: string; index: number },
    target: { zone: string; insertIndex: number },
  ) => {
    const move = computeMove(source, target)
    if (!move) return
    dispatch({ type: 'move', ...move })
    dispatch({
      type: 'setUi',
      ui: { itemSelector: { zone: move.destinationZone, index: move.destinationIndex } },
    })
  }, [dispatch])

  /* ---------- window listeners: attached only while a press is live ---------- */

  const handlersRef = useRef<{
    move: (event: PointerEvent) => void
    up: () => void
    key: (event: KeyboardEvent) => void
  } | null>(null)

  // Identities must survive re-renders or removeEventListener would miss; these thin wrappers
  // are created once and read the latest handlers off the ref.
  const listeners = useMemo(() => ({
    move: (event: PointerEvent) => handlersRef.current?.move(event),
    up: () => handlersRef.current?.up(),
    key: (event: KeyboardEvent) => handlersRef.current?.key(event),
  }), [])

  const detach = useCallback(() => {
    if (!listeningRef.current) return
    listeningRef.current = false
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.up)
    window.removeEventListener('keydown', listeners.key)
  }, [listeners])

  const endDrag = useCallback((commit: boolean) => {
    const dragged = dragRef.current
    const target = commit ? dropRef.current : null
    if (dragged && target) {
      applyMove(
        { zone: dragged.zone, index: dragged.index },
        { zone: target.zone, insertIndex: target.insertIndex },
      )
    }

    const pending = pendingRef.current
    if (pending?.holdTimer) clearTimeout(pending.holdTimer)

    dragRef.current = null
    dropRef.current = null
    pendingRef.current = null
    clearAutoExpand()
    stopAutoScroll()
    detach()
    setDrag(null)
    setDrop(null)
    setPointer(null)
  }, [applyMove, clearAutoExpand, detach, stopAutoScroll])

  const startDrag = useCallback((state: DragState) => {
    dragRef.current = state
    draggedRef.current = true
    setDrag(state)
  }, [])

  const onPointerMove = useCallback((event: PointerEvent) => {
    const pending = pendingRef.current

    if (pending && !dragRef.current) {
      const travelled = Math.hypot(event.clientX - pending.x, event.clientY - pending.y)
      if (travelled <= DRAG_THRESHOLD) return
      if (event.pointerType === 'mouse') {
        startDrag(pending.drag)
      } else {
        // Finger moved before the hold elapsed: that is a scroll, not a drag.
        if (pending.holdTimer) clearTimeout(pending.holdTimer)
        pendingRef.current = null
        detach()
        return
      }
    }

    if (!dragRef.current) return
    event.preventDefault()
    setPointer({ x: event.clientX, y: event.clientY })

    const scroller = scrollParentOf(containerRef.current)
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      if (event.clientY < rect.top + AUTOSCROLL_EDGE) runAutoScroll(-AUTOSCROLL_STEP)
      else if (event.clientY > rect.bottom - AUTOSCROLL_EDGE) runAutoScroll(AUTOSCROLL_STEP)
      else stopAutoScroll()
    }

    const target = resolveDrop(event.clientY)
    dropRef.current = target
    setDrop(target)
  }, [detach, resolveDrop, runAutoScroll, startDrag, stopAutoScroll])

  const onPointerUp = useCallback(() => {
    endDrag(Boolean(dragRef.current))
  }, [endDrag])

  const onKeyDownWindow = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !dragRef.current) return
    endDrag(false)
  }, [endDrag])

  useEffect(() => {
    handlersRef.current = { move: onPointerMove, up: onPointerUp, key: onKeyDownWindow }
  }, [onKeyDownWindow, onPointerMove, onPointerUp])

  useEffect(() => () => {
    detach()
    clearAutoExpand()
    stopAutoScroll()
  }, [clearAutoExpand, detach, stopAutoScroll])

  const beginPress = useCallback((event: React.PointerEvent, row: ItemRow) => {
    if (event.button !== 0) return

    const state: DragState = {
      id: row.item.id,
      zone: row.item.zone,
      index: row.item.index,
      label: row.item.label,
    }

    draggedRef.current = false
    pendingRef.current = {
      drag: state,
      x: event.clientX,
      y: event.clientY,
      holdTimer: event.pointerType === 'mouse'
        ? null
        : window.setTimeout(() => {
          if (pendingRef.current) startDrag(pendingRef.current.drag)
        }, TOUCH_HOLD_MS),
    }

    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener('pointermove', listeners.move, { passive: false })
    window.addEventListener('pointerup', listeners.up)
    window.addEventListener('pointercancel', listeners.up)
    window.addEventListener('keydown', listeners.key)
  }, [listeners, startDrag])

  /* ---------- keyboard reordering (Alt + arrows), so this is not mouse-only ---------- */

  const siblingsOf = useCallback((item: ItemRow['item']) => {
    const parentId = item.zone.split(':')[0] ?? 'root'
    if (parentId === 'root') return roots.find((z) => z.compound === item.zone)?.items ?? []
    return index.itemById.get(parentId)?.zones.find((z) => z.compound === item.zone)?.items ?? []
  }, [index, roots])

  const handleRowKeyDown = useCallback((event: React.KeyboardEvent, row: ItemRow) => {
    if (!event.altKey) return
    const { item } = row
    const siblings = siblingsOf(item)
    const source = { zone: item.zone, index: item.index }

    if (event.key === 'ArrowUp' && item.index > 0) {
      event.preventDefault()
      applyMove(source, { zone: item.zone, insertIndex: item.index - 1 })
    } else if (event.key === 'ArrowDown' && item.index < siblings.length - 1) {
      event.preventDefault()
      applyMove(source, { zone: item.zone, insertIndex: item.index + 2 })
    } else if (event.key === 'ArrowLeft') {
      const parentId = item.zone.split(':')[0] ?? 'root'
      const parent = parentId === 'root' ? undefined : index.itemById.get(parentId)
      if (!parent) return
      event.preventDefault()
      applyMove(source, { zone: parent.zone, insertIndex: parent.index + 1 })
    } else if (event.key === 'ArrowRight') {
      const previous = siblings[item.index - 1]
      const targetZone = previous?.zones[0]
      if (!targetZone) return
      event.preventDefault()
      setExpanded(previous.id, true)
      applyMove(source, { zone: targetZone.compound, insertIndex: targetZone.items.length })
    }
  }, [applyMove, index, setExpanded, siblingsOf])

  /* ---------- render ---------- */

  const registerRow = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(key, el)
    else rowRefs.current.delete(key)
  }, [])

  const isEmptyOutline = rows.length === 1 && rows[0]?.kind === 'empty'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        fontFamily: 'var(--puck-font-family)',
        fontSize: 'var(--puck-font-size-xxs)',
        padding: 'var(--puck-space-2)',
        userSelect: drag ? 'none' : undefined,
        touchAction: drag ? 'none' : undefined,
      }}
    >
      {isEmptyOutline ? (
        <div style={{
          textAlign: 'center',
          color: 'var(--puck-color-text-subtle)',
          margin: 'var(--puck-space-2) var(--puck-space-1)',
        }}>
          Drop a block on the canvas to get started.
        </div>
      ) : rows.map((row) => {
        if (row.kind === 'zone') {
          return (
            <div
              key={row.key}
              ref={registerRow(row.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--puck-space-2)',
                marginBlock: 'var(--puck-space-2)',
                marginInlineStart: `${row.depth * INDENT + 4}px`,
                color: 'var(--puck-color-text-muted)',
                fontSize: 'var(--puck-font-size-xxxs)',
                textTransform: 'uppercase',
              }}
            >
              {row.zone.label}
            </div>
          )
        }

        if (row.kind === 'empty') {
          const active = drop?.zone === row.zone.compound
          return (
            <div
              key={row.key}
              ref={registerRow(row.key)}
              style={{
                marginBlock: 'var(--puck-space-1)',
                marginInlineStart: `${row.depth * INDENT + 4}px`,
                padding: 'var(--puck-space-2)',
                borderRadius: 'var(--puck-radius-m)',
                border: '1px dashed var(--puck-color-border)',
                color: 'var(--puck-color-text-subtle)',
                background: active ? 'var(--puck-color-interactive-soft)' : 'transparent',
                textAlign: 'center',
              }}
            >
              Empty
            </div>
          )
        }

        const { item } = row
        const isSelected = selectedId === item.id
        const isDragged = drag?.id === item.id

        return (
          <div
            key={row.key}
            ref={registerRow(row.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginInlineStart: `${row.depth * INDENT}px`,
              borderRadius: 'var(--puck-radius-m)',
              border: `1px solid ${isSelected ? 'var(--puck-color-selection-border)' : 'transparent'}`,
              background: isSelected ? 'var(--puck-color-interactive-subtle)' : 'transparent',
              opacity: isDragged ? 0.45 : 1,
            }}
            onPointerEnter={() => { if (!drag) setCanvasHover(item.id, true) }}
            onPointerLeave={() => { if (!drag) setCanvasHover(item.id, false) }}
          >
            {row.expandable ? (
              <button
                type="button"
                aria-label={row.expanded ? 'Collapse' : 'Expand'}
                aria-expanded={row.expanded}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setExpanded(item.id, !row.expanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 24,
                  flexShrink: 0,
                  background: 'none',
                  border: 0,
                  padding: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <ChevronIcon open={row.expanded} />
              </button>
            ) : (
              <span style={{ width: 20, flexShrink: 0 }} aria-hidden="true" />
            )}

            <button
              type="button"
              draggable={false}
              onPointerDown={(e) => beginPress(e, row)}
              onClick={() => {
                if (draggedRef.current) { draggedRef.current = false; return }
                if (isSelected) {
                  dispatch({ type: 'setUi', ui: { itemSelector: null } })
                  return
                }
                dispatch({ type: 'setUi', ui: { itemSelector: { zone: item.zone, index: item.index } } })
                scrollCanvasTo(item.id)
              }}
              onKeyDown={(e) => handleRowKeyDown(e, row)}
              title={`${item.label} - drag to move, or Alt + arrow keys`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--puck-space-2)',
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 0,
                padding: 'var(--puck-space-2) var(--puck-space-1)',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'start',
                cursor: drag ? 'grabbing' : 'grab',
              }}
            >
              <span style={{ color: 'var(--puck-color-highlight)', display: 'flex' }}>
                <ComponentIcon type={item.type} />
              </span>
              <span style={{ flex: 1, overflowX: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
              <span style={{ color: 'var(--puck-color-text-subtle)', display: 'flex' }}>
                <GripIcon />
              </span>
            </button>
          </div>
        )
      })}

      {drop && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: drop.left,
            right: 4,
            top: drop.top - 1,
            height: 2,
            borderRadius: 2,
            background: 'var(--puck-color-azure-05)',
            pointerEvents: 'none',
          }}
        />
      )}

      {drag && pointer && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: pointer.x + 12,
            top: pointer.y + 8,
            zIndex: 100,
            pointerEvents: 'none',
            padding: '4px 8px',
            borderRadius: 'var(--puck-radius-m)',
            background: 'var(--puck-color-surface)',
            border: '1px solid var(--puck-color-border)',
            boxShadow: '0 4px 12px rgb(0 0 0 / 0.18)',
            fontSize: 'var(--puck-font-size-xxs)',
            color: 'var(--puck-color-text)',
            whiteSpace: 'nowrap',
          }}
        >
          {drag.label}
        </div>
      )}
    </div>
  )
}
