import { createContext, useContext } from 'react'

// Two different questions, both asked by the Puck header overrides:
//
//   hasUnsavedChanges — "would leaving right now lose work?" (back link confirm,
//     beforeunload warning). True only for edits made in this session.
//   canUpdate — "would clicking Update actually change anything?" (Update button
//     enabled state). Not the same thing: a page restored from history has no
//     unsaved edits, yet its draft still sits ahead of what's live, so Update must
//     stay clickable there.
//
// Passed by context rather than as arguments to the override factories: those
// factories only run inside a useMemo, so these flags would land in its deps - and
// they flip on the first real edit, which recreates the whole overrides object and
// makes Puck reinitialise mid-edit (losing focus/scroll on whatever field was being
// typed into). Reading them via context inside each override's own render keeps the
// caller's memo stable while the overrides still see the live values.
export type EditorDirtyState = {
  hasUnsavedChanges: boolean
  canUpdate: boolean
}

// canUpdate defaults to true so an override rendered outside a provider still has a
// working button - a dead Update button is a far worse failure than a redundant one.
const EditorDirtyContext = createContext<EditorDirtyState>({ hasUnsavedChanges: false, canUpdate: true })

export const EditorDirtyProvider = EditorDirtyContext.Provider

export function useEditorDirtyState() {
  return useContext(EditorDirtyContext)
}
