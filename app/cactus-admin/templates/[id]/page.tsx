'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'

const TemplateEditor = dynamic(() => import('./TemplateEditor'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>
      Loading builder…
    </div>
  ),
})

type TemplateData = {
  id: string
  name: string
  type: 'HEADER' | 'FOOTER' | 'PAGE'
  status: 'draft' | 'published'
  builderData: Data | null
}

const TYPE_LABELS: Record<string, string> = { HEADER: 'Header', FOOTER: 'Footer', PAGE: 'Page' }

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [template, setTemplate] = useState<TemplateData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/templates/${id}`)
      .then((r) => r.json())
      .then(setTemplate)
      .catch(() => setError('Failed to load template'))
  }, [id])

  if (!template) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>{error || 'Loading…'}</div>
  }

  const initialData: Data = template.builderData ?? { content: [], root: { props: {} }, zones: {} }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
        zIndex: 100,
        position: 'relative',
      }}>
        <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/${adminPath}/templates`)}>
          ← Templates
        </button>
        <strong style={{ fontSize: '0.875rem', color: '#111827', flex: 1 }}>{template.name}</strong>
        <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: 4 }}>
          {TYPE_LABELS[template.type] ?? template.type}
        </span>
      </div>
      <TemplateEditor
        templateId={id}
        templateName={template.name}
        initialData={initialData}
        initialStatus={template.status}
      />
    </>
  )
}
