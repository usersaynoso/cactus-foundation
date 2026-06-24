'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { generateSlug } from '@/lib/utils'

export default function NewPagePage() {
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [body, setBody] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [bodyFormat, setBodyFormat] = useState<'markdown' | 'builder'>('markdown')
  const [menuIds, setMenuIds] = useState<string[]>([])
  const [menus, setMenus] = useState<{ id: string; name: string }[]>([])
  const [canManageMenus, setCanManageMenus] = useState(false)
  const [canManageTemplates, setCanManageTemplates] = useState(false)
  const [pageTemplates, setPageTemplates] = useState<{ id: string; name: string }[]>([])
  const [templateId, setTemplateId] = useState('')
  const [templateMode, setTemplateMode] = useState<'copy' | 'linked'>('copy')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/pages/perms').then((r) => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/api/admin/menus').then((r) => r.ok ? r.json() : { menus: [] }).catch(() => ({ menus: [] })),
      fetch('/api/admin/templates').then((r) => ({ ok: r.ok, resp: r })).catch(() => ({ ok: false, resp: null })),
    ]).then(async ([perms, menusData, templatesResult]) => {
      setCanManageMenus((perms as { canManageMenus?: boolean }).canManageMenus ?? false)
      setMenus((menusData as { menus?: { id: string; name: string }[] }).menus ?? [])
      const { ok, resp } = templatesResult as { ok: boolean; resp: Response | null }
      setCanManageTemplates(ok)
      if (ok && resp) {
        const d = await resp.json()
        const allTemplates = (d as { templates?: { id: string; name: string; type: string }[] }).templates ?? []
        setPageTemplates(allTemplates.filter((t) => t.type === 'PAGE'))
      }
    }).catch(() => {})
  }, [])

  function handleTitleChange(val: string) {
    setTitle(val)
    if (!slugEdited) setSlug(generateSlug(val))
  }

  async function handleSave(format = bodyFormat) {
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { title, slug, body, metaDescription, status, bodyFormat: format }
      if (canManageMenus && menuIds.length > 0) payload.menuIds = menuIds
      if (templateId) { payload.templateId = templateId; payload.templateMode = templateMode }
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to create page')
      if (format === 'builder') {
        router.push(`/${adminPath}/pages/${d.id}`)
      } else {
        router.push(`/${adminPath}/pages`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create page')
    } finally {
      setLoading(false)
    }
  }

  function handleBuilderClick() {
    setBodyFormat('builder')
    if (title && slug) {
      handleSave('builder')
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-header">
        <h1 className="page-title">New Page</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            style={{ padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'inherit' }}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button className="btn btn-primary" disabled={!title || !slug || loading} onClick={() => handleSave()}>
            {loading ? 'Saving…' : bodyFormat === 'builder' ? 'Create & Open Builder' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Page title" autoFocus />
      </div>

      <div className="field">
        <label>Slug</label>
        <input
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugEdited(true) }}
          placeholder="page-slug"
        />
        <span className="field-hint">URL: <code>/{slug}</code></span>
      </div>

      {canManageTemplates && pageTemplates.length > 0 && (
        <div className="field">
          <label>Start from template (optional)</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— Start blank —</option>
            {pageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {templateId && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <input type="radio" name="templateMode" value="copy" checked={templateMode === 'copy'} onChange={() => setTemplateMode('copy')} />
                  Copy — paste the template layout in, then edit freely
                </label>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <input type="radio" name="templateMode" value="linked" checked={templateMode === 'linked'} onChange={() => setTemplateMode('linked')} />
                  Live link — template blocks update automatically when the template changes
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>Editor</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={bodyFormat === 'markdown' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setBodyFormat('markdown')}
          >
            Markdown
          </button>
          <button
            type="button"
            className={bodyFormat === 'builder' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={handleBuilderClick}
            disabled={bodyFormat === 'builder' && (!title || !slug || loading)}
          >
            {bodyFormat === 'builder' && loading ? 'Creating…' : 'Page Builder'}
          </button>
        </div>
        {bodyFormat === 'builder' && (
          <span className="field-hint">
            {title && slug
              ? 'Click Page Builder above to create the page and open the visual builder.'
              : 'Enter a title above, then click Page Builder to create the page and open the visual builder.'}
          </span>
        )}
      </div>

      {bodyFormat === 'markdown' && (
        <>
          <div className="field">
            <label>Body (Markdown)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              placeholder="Write your page content in Markdown…"
              style={{ fontFamily: 'monospace', fontSize: '0.9375rem' }}
            />
          </div>

          <div className="field">
            <label>Meta description</label>
            <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="Brief description for search engines (optional)" />
          </div>
        </>
      )}

      {canManageMenus && menus.length > 0 && (
        <div className="field">
          <label>Show in menus</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {menus.map((menu) => (
              <label key={menu.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={menuIds.includes(menu.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMenuIds((prev) => [...prev, menu.id])
                    } else {
                      setMenuIds((prev) => prev.filter((id) => id !== menu.id))
                    }
                  }}
                />
                {menu.name}
              </label>
            ))}
          </div>
          <span className="field-hint">The page will be added to the selected menus when saved.</span>
        </div>
      )}
    </div>
  )
}
