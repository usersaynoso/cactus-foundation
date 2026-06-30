'use client'
import { useEffect, useRef, useState } from 'react'
import { translateLogLine } from '@/lib/deploy-log-translator'

interface MessageItem {
  id: number
  text: string
  timestamp: Date
  isFinal: boolean
}

interface DeployLogViewerProps {
  rawLines: string[]
  onComplete?: () => void
  onError?: (message: string) => void
}

let nextId = 0

export default function DeployLogViewer({ rawLines, onComplete, onError: _onError }: DeployLogViewerProps) {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const processedCountRef = useRef(0)
  const seenTextsRef = useRef(new Set<string>())

  useEffect(() => {
    const newLines = rawLines.slice(processedCountRef.current)
    processedCountRef.current = rawLines.length

    const batch: MessageItem[] = []
    let shouldComplete = false

    for (const rawLine of newLines) {
      const text = translateLogLine(rawLine)
      if (!text) continue
      if (seenTextsRef.current.has(text)) continue
      seenTextsRef.current.add(text)
      const isFinal = text.startsWith('Bish bash bosh')
      batch.push({ id: nextId++, text, timestamp: new Date(), isFinal })
      if (isFinal) shouldComplete = true
    }

    if (batch.length > 0) setMessages(prev => [...prev, ...batch])
    if (shouldComplete) onComplete?.()
  }, [rawLines, onComplete])

  const visible = messages.slice(-8)
  const hasFade = messages.length > 8

  function formatTime(d: Date) {
    return d.toTimeString().slice(0, 8)
  }

  return (
    <div
      className="card"
      style={{ position: 'relative', overflow: 'hidden', padding: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          background: 'linear-gradient(to bottom, var(--color-surface), transparent)',
          zIndex: 10,
          pointerEvents: 'none',
          opacity: hasFade ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; }
        }
      `}</style>
      {visible.map((msg, idx) => {
        const isTopmost = idx === 0 && hasFade
        const isNewest = idx === visible.length - 1
        const color = isTopmost
          ? 'var(--color-text-muted)'
          : msg.isFinal
          ? 'var(--color-success)'
          : isNewest
          ? 'var(--color-text)'
          : 'var(--color-text-secondary)'
        const opacity = isTopmost ? 0.18 : 1

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '0.45rem 1rem',
              alignItems: 'baseline',
              animation: 'slideIn 0.3s ease',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-muted)',
                minWidth: 62,
                flexShrink: 0,
                opacity,
              }}
            >
              {formatTime(msg.timestamp)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                lineHeight: 1.55,
                color,
                opacity,
              }}
            >
              {msg.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}
