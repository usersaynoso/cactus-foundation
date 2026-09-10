'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ResolvedNavSection } from '@/lib/nav/admin-menu'
import {
  applyNavOrder,
  favouritesAfterDrop,
  favouritesAfterKeyboardMove,
  orderAfterDrop,
  orderAfterKeyboardMove,
  parseNavOrder,
  type NavDropTarget,
  type NavOrderMap,
} from '@/lib/nav/sidebar-order'

// ---------------------------------------------------------------------------
// Drag-to-reorder for the admin sidebar: the pointer half. The rules about what
// ends up where live in lib/nav/sidebar-order.ts, which is testable on its own.
//
// Deliberately pointer events rather than HTML5 drag-and-drop: native dragging
// swaps the cursor for a move/alias glyph and drags a translucent ghost of the
// link about. The rail is meant to look exactly the same mid-drag as it does at
// rest, so nothing in here — or in the CSS beside it — sets a `cursor`.
// ---------------------------------------------------------------------------

const ORDER_KEY = 'cactus-sidebar-item-order'
/** Movement below this is a click; above it, a drag. */
const DRAG_THRESHOLD_PX = 5
/** How near a scroller's edge the pointer must get before it auto-scrolls. */
const AUTOSCROLL_EDGE_PX = 48
const AUTOSCROLL_STEP_PX = 10
const AUTOSCROLL_INTERVAL_MS = 16

const TREE_SCROLLER = '.admin-sidebar-nav-scroll'
const FAV_SCROLLER = '.admin-nav-pinned-favs'

/**
 * The two independent drag areas. A row never crosses between them: Favourites
 * is a pinned personal shortlist and the tree is the menu proper, so a link
 * joins or leaves Favourites by its star, which is unambiguous.
 */
export type NavDragZone = 'tree' | 'fav'

type PointerStart = { pointerId: number; x: number; y: number; zone: NavDragZone; id: string }

type Options = {
  /** Sections exactly as the server resolved them. */
  sections: ResolvedNavSection[]
  /** Favourite item ids, in the order they are pinned. */
  favourites: string[]
  /** Persist a re-ordered favourites list. */
  setFavouritesOrder: (next: string[]) => void
  /**
   * Called with the section a link was dropped straight into. The sidebar uses
   * it to open that section: dropping onto a collapsed heading otherwise looks
   * exactly like losing the link.
   */
  onSectionDrop?: (sectionId: string) => void
}

export function useNavReorder({ sections, favourites, setFavouritesOrder, onSectionDrop }: Options) {
  const [order, setOrder] = useState<NavOrderMap>({})
  const [drag, setDrag] = useState<{ zone: NavDragZone; id: string } | null>(null)
  const [target, setTarget] = useState<NavDropTarget | null>(null)

  const startRef = useRef<PointerStart | null>(null)
  const draggingRef = useRef(false)
  const targetRef = useRef<NavDropTarget | null>(null)
  /** Set for the moment between a drag ending and the click it would otherwise fire. */
  const draggedRef = useRef(false)
  const refocusRef = useRef<string | null>(null)
  const scrollDirRef = useRef(0)
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Held in a ref so a caller passing a fresh closure each render cannot rebuild
  // every pointer handler underneath an in-flight drag.
  const onSectionDropRef = useRef(onSectionDrop)
  useEffect(() => {
    onSectionDropRef.current = onSectionDrop
  })

  // Read the saved arrangement after mount — reading localStorage in a useState
  // initialiser makes the client's first render diverge from the server HTML.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, not in the initialiser, or first client render diverges from server HTML
      if (raw) setOrder(parseNavOrder(raw))
    } catch {
      // ignore an unreadable cache
    }
  }, [])

  const persistOrder = useCallback((next: NavOrderMap) => {
    setOrder(next)
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next))
    } catch {
      // ignore quota/serialisation failures
    }
  }, [])

  const orderedSections = useMemo(() => applyNavOrder(sections, order), [sections, order])

  // ── Auto-scroll while dragging near a scroller's edge ─────────────────────

  const stopAutoScroll = useCallback(() => {
    if (scrollTimerRef.current !== null) {
      clearInterval(scrollTimerRef.current)
      scrollTimerRef.current = null
    }
    scrollDirRef.current = 0
  }, [])

  const updateAutoScroll = useCallback(
    (zone: NavDragZone, clientY: number) => {
      const scroller = document.querySelector<HTMLElement>(zone === 'fav' ? FAV_SCROLLER : TREE_SCROLLER)
      if (!scroller) return
      const rect = scroller.getBoundingClientRect()
      const dir =
        clientY < rect.top + AUTOSCROLL_EDGE_PX ? -1 : clientY > rect.bottom - AUTOSCROLL_EDGE_PX ? 1 : 0
      if (dir === scrollDirRef.current) return
      stopAutoScroll()
      scrollDirRef.current = dir
      if (dir === 0) return
      scrollTimerRef.current = setInterval(() => {
        scroller.scrollTop += dir * AUTOSCROLL_STEP_PX
      }, AUTOSCROLL_INTERVAL_MS)
    },
    [stopAutoScroll]
  )

  useEffect(() => stopAutoScroll, [stopAutoScroll])

  // ── Hit testing ───────────────────────────────────────────────────────────

  const hitTest = useCallback(
    (zone: NavDragZone, dragId: string, x: number, y: number): NavDropTarget | null => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null

      const row = el.closest<HTMLElement>('[data-drag-id]')
      if (row) {
        if (row.dataset.dragZone !== zone) return null
        const id = row.dataset.dragId
        if (!id || id === dragId) return null
        const rect = row.getBoundingClientRect()
        return { kind: 'row', id, edge: y < rect.top + rect.height / 2 ? 'before' : 'after' }
      }

      // A section heading and an emptied section both accept a drop, so a link
      // can still be moved into a section that is collapsed or that you have
      // just emptied — neither has a row left to aim at.
      if (zone !== 'tree') return null
      const sectionId = el.closest<HTMLElement>('[data-drag-section]')?.dataset.dragSection
      return sectionId ? { kind: 'section', sectionId } : null
    },
    []
  )

  // ── Pointer handlers, spread onto each draggable row ──────────────────────

  const endDrag = useCallback(() => {
    draggingRef.current = false
    targetRef.current = null
    startRef.current = null
    stopAutoScroll()
    setDrag(null)
    setTarget(null)
  }, [stopAutoScroll])

  const applyDrop = useCallback(
    (zone: NavDragZone, dragId: string, dropTarget: NavDropTarget) => {
      if (zone === 'fav') {
        const next = favouritesAfterDrop(favourites, dragId, dropTarget)
        if (next) setFavouritesOrder(next)
        return
      }
      const next = orderAfterDrop(orderedSections, dragId, dropTarget)
      if (!next) return
      persistOrder(next)
      if (dropTarget.kind === 'section') onSectionDropRef.current?.(dropTarget.sectionId)
    },
    [favourites, orderedSections, persistOrder, setFavouritesOrder]
  )

  const rowProps = useCallback(
    (zone: NavDragZone, id: string) => ({
      'data-drag-zone': zone,
      'data-drag-id': id,
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        // Touch is left alone: the same vertical gesture scrolls the rail, and
        // stealing it would leave the menu unscrollable on a phone.
        if (e.button !== 0 || e.pointerType === 'touch') return
        if ((e.target as HTMLElement).closest('button, input')) return
        startRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, zone, id }
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const start = startRef.current
        if (!start || start.pointerId !== e.pointerId) return
        if (!draggingRef.current) {
          if (
            Math.abs(e.clientX - start.x) < DRAG_THRESHOLD_PX &&
            Math.abs(e.clientY - start.y) < DRAG_THRESHOLD_PX
          ) {
            return
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          draggingRef.current = true
          draggedRef.current = true
          setDrag({ zone: start.zone, id: start.id })
        }
        const next = hitTest(start.zone, start.id, e.clientX, e.clientY)
        targetRef.current = next
        setTarget(next)
        updateAutoScroll(start.zone, e.clientY)
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        const start = startRef.current
        const dropTarget = targetRef.current
        const wasDragging = draggingRef.current
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        endDrag()
        if (!start || !wasDragging) return
        if (dropTarget) applyDrop(start.zone, start.id, dropTarget)
        // The click the browser is about to synthesise gets swallowed by
        // consumeClick; this clears the flag when the pointer came up somewhere
        // that fires no click at all.
        window.setTimeout(() => {
          draggedRef.current = false
        }, 0)
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        endDrag()
        draggedRef.current = false
      },
    }),
    [applyDrop, endDrag, hitTest, updateAutoScroll]
  )

  /** True when the click about to fire is the tail of a drag and must not navigate. */
  const consumeClick = useCallback(() => {
    if (!draggedRef.current) return false
    draggedRef.current = false
    return true
  }, [])

  // ── Keyboard equivalent: a drag nobody can do with a mouse is a dead end ──

  const moveByKeyboard = useCallback(
    (zone: NavDragZone, id: string, delta: -1 | 1) => {
      if (zone === 'fav') {
        const next = favouritesAfterKeyboardMove(favourites, id, delta)
        if (!next) return
        setFavouritesOrder(next)
      } else {
        const next = orderAfterKeyboardMove(orderedSections, id, delta)
        if (!next) return
        persistOrder(next)
      }
      refocusRef.current = id
    },
    [favourites, orderedSections, persistOrder, setFavouritesOrder]
  )

  // Focus follows the row it just moved, or a keyboard user loses their place.
  useEffect(() => {
    const id = refocusRef.current
    if (!id) return
    refocusRef.current = null
    document.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"] [data-nav-item]`)?.focus()
  }, [order, favourites])

  // ── Render helpers ────────────────────────────────────────────────────────

  const rowClass = useCallback(
    (zone: NavDragZone, id: string) => {
      let cls = ''
      if (drag && drag.zone === zone && drag.id === id) cls += ' admin-nav-row--dragging'
      if (drag?.zone === zone && target?.kind === 'row' && target.id === id) {
        cls += target.edge === 'before' ? ' admin-nav-row--drop-before' : ' admin-nav-row--drop-after'
      }
      return cls
    },
    [drag, target]
  )

  const isSectionTarget = useCallback(
    (sectionId: string) => target?.kind === 'section' && target.sectionId === sectionId,
    [target]
  )

  const resetOrder = useCallback(() => {
    setOrder({})
    try {
      localStorage.removeItem(ORDER_KEY)
    } catch {
      // ignore
    }
  }, [])

  return {
    /** Sections with this user's arrangement applied. Render these, not the props. */
    sections: orderedSections,
    isDragging: drag !== null,
    isDraggingTree: drag?.zone === 'tree',
    hasCustomOrder: Object.keys(order).length > 0,
    resetOrder,
    rowProps,
    rowClass,
    isSectionTarget,
    consumeClick,
    moveByKeyboard,
  }
}
