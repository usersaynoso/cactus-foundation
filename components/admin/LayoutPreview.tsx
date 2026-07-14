import type { CSSProperties } from 'react'

// A small structural drawing of a layout, built from the layout's own builder
// data. Nothing is hand-authored per template and nothing is stored: the
// preview is derived, so it can never drift from the design it claims to show,
// and a module's starter templates get one without the module doing anything.
//
// It reads structure, not content. Containers (Grid, Split, Section, Group)
// decide the shape; leaf blocks become the boxes and bars inside it. Blocks it
// has never heard of - which is every block a module ships - fall back to a
// plain box, and the structure around them still tells the owner what they are
// picking. That is the whole job: sidebar-left vs sidebar-right vs full-width,
// at a glance, without reading four near-identical descriptions.

type Block = { type: string; props?: Record<string, unknown> }

type LayoutData = {
  content?: Block[]
  root?: { props?: Record<string, unknown> }
  zones?: Record<string, Block[]>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const blocks = (v: unknown): Block[] => (Array.isArray(v) ? (v as Block[]) : [])

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const bar = (width: string | number, height: number, colour: string, opacity = 1, radius = 2): CSSProperties => ({
  width, height, borderRadius: radius, background: colour, opacity, flexShrink: 0,
})

function Logo() {
  return <div style={bar(20, 8, 'var(--color-primary)', 0.55, 2)} />
}

function Nav({ vertical }: { vertical?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 3, flexShrink: 0 }}>
      {[0, 1, 2].map((i) => <div key={i} style={bar(12, 4, 'var(--color-text-muted)', 0.45)} />)}
    </div>
  )
}

function Pill() {
  return <div style={bar(16, 7, 'var(--color-primary)', 0.3, 3)} />
}

function Dot() {
  return <div style={bar(6, 6, 'var(--color-text-muted)', 0.4, 3)} />
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {[0, 1, 2].map((i) => <Dot key={i} />)}
    </div>
  )
}

function Lines({ count = 3, align = 'left' }: { count?: number; align?: string }) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', alignItems: justify }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={bar(i === count - 1 ? '60%' : '100%', 3, 'var(--color-border-strong)', 0.7, 1)} />
      ))}
    </div>
  )
}

function HeadingBar({ align = 'left' }: { align?: string }) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  return (
    <div style={{ display: 'flex', justifyContent: justify, width: '100%' }}>
      <div style={bar('45%', 6, 'var(--color-text-muted)', 0.75, 2)} />
    </div>
  )
}

function CopyrightLine({ align = 'center' }: { align?: string }) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  return (
    <div style={{ display: 'flex', justifyContent: justify, width: '100%' }}>
      <div style={bar('40%', 3, 'var(--color-text-muted)', 0.4, 1)} />
    </div>
  )
}

function Tiles() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: '100%', flex: 1, minHeight: 22 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ background: 'var(--color-border)', borderRadius: 2, opacity: 0.7, minHeight: 9 }} />
      ))}
    </div>
  )
}

/** The page's own content drops in here. The one thing a page layout must show. */
function Slot() {
  return (
    <div style={{
      flex: 1, minHeight: 26, width: '100%',
      background: 'var(--color-primary-subtle)',
      border: '1px dashed var(--color-primary)',
      borderRadius: 3,
    }} />
  )
}

function Hero({ minHeight }: { minHeight: string }) {
  const height = minHeight === 'full' ? 58 : minHeight === 'half' ? 38 : 28
  return (
    <div style={{
      width: '100%', height, borderRadius: 3, flexShrink: 0,
      background: 'var(--color-primary-subtle)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      <div style={bar('40%', 6, 'var(--color-primary)', 0.5, 2)} />
      <div style={bar('55%', 3, 'var(--color-primary)', 0.3, 1)} />
    </div>
  )
}

function Panel() {
  return (
    <div style={{
      width: '100%', minHeight: 16, borderRadius: 3, flexShrink: 0,
      background: 'var(--color-warning-bg)',
      border: '1px solid var(--color-warning)',
      opacity: 0.7,
    }} />
  )
}

function GenericBox() {
  return <div style={{ flex: 1, width: '100%', minHeight: 14, background: 'var(--color-border)', borderRadius: 2, opacity: 0.6 }} />
}

// ---------------------------------------------------------------------------
// Block → drawing
// ---------------------------------------------------------------------------

function renderBlock(block: Block, data: LayoutData, key: string) {
  const props = block.props ?? {}

  switch (block.type) {
    // Containers
    case 'Grid':   return <GridPreview key={key} props={props} data={data} />
    case 'Split':  return <SplitPreview key={key} props={props} data={data} />
    case 'Group':  return <GroupPreview key={key} props={props} data={data} />
    case 'Section': return <SectionPreview key={key} props={props} data={data} />

    // Leaves
    case 'SiteLogo':    return <Logo key={key} />
    case 'MenuBlock':   return <Nav key={key} vertical={str(props.orientation) === 'vertical'} />
    case 'LoginButton':
    case 'ButtonLink':  return <Pill key={key} />
    case 'ThemeToggle': return <Dot key={key} />
    case 'SocialLinks': return <Dots key={key} />
    case 'Copyright':   return <CopyrightLine key={key} align={str(props.alignment) || 'center'} />
    case 'Heading':     return <HeadingBar key={key} align={str(props.align) || 'left'} />
    case 'TextBlock':
    case 'RichText':    return <Lines key={key} count={2} align={str(props.align) || 'left'} />
    case 'Callout':     return <Panel key={key} />
    case 'Hero':        return <Hero key={key} minHeight={str(props.minHeight) || 'auto'} />
    case 'ContentSlot': return <Slot key={key} />
  }

  // Everything a module ships lands here. These are shape hints on ordinary
  // English words in the block's own name - no module is named anywhere.
  const name = block.type
  if (/Header$/.test(name)) return <HeadingBar key={key} />
  if (/List|Grid|Browser/.test(name)) return <Tiles key={key} />
  if (/Body|Comments|Detail/.test(name)) return <Lines key={key} count={4} />
  return <GenericBox key={key} />
}

function renderAll(list: Block[], data: LayoutData, prefix: string) {
  return list.map((block, i) => renderBlock(block, data, `${prefix}-${i}`))
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

const GAP = 4

function GroupPreview({ props, data }: { props: Record<string, unknown>; data: LayoutData }) {
  const column = str(props.direction) === 'column'
  const justify = str(props.justify)
  const map: Record<string, string> = { between: 'space-between', center: 'center', start: 'flex-start', end: 'flex-end', around: 'space-around' }
  return (
    <div style={{
      display: 'flex',
      flexDirection: column ? 'column' : 'row',
      justifyContent: map[justify] ?? 'space-between',
      alignItems: 'center',
      gap: GAP,
      width: '100%',
    }}>
      {renderAll(blocks(props.items), data, 'g')}
    </div>
  )
}

/** columnSizes is "equal" or a weight pair like "30-70". */
function columnWeights(count: number, sizes: string): number[] {
  const pair = /^(\d+)-(\d+)$/.exec(sizes)
  if (pair && count === 2) return [Number(pair[1]), Number(pair[2])]
  return Array.from({ length: count }, () => 1)
}

function GridPreview({ props, data }: { props: Record<string, unknown>; data: LayoutData }) {
  const count = Math.min(Math.max(Number(props.columns) || 1, 1), 4)
  const weights = columnWeights(count, str(props.columnSizes))
  const aligns = [str(props.col1Align), str(props.col2Align), str(props.col3Align), str(props.col4Align)]
  const cols = [props.col1, props.col2, props.col3, props.col4]

  return (
    <div style={{ display: 'flex', gap: GAP, width: '100%', alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => {
        const align = aligns[i] === 'center' ? 'center' : aligns[i] === 'end' ? 'flex-end' : 'flex-start'
        return (
          <div key={i} style={{
            flex: `${weights[i]} 1 0`, minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: GAP,
            alignItems: align, justifyContent: 'center',
          }}>
            {renderAll(blocks(cols[i]), data, `c${i}`)}
          </div>
        )
      })}
    </div>
  )
}

function SplitPreview({ props, data }: { props: Record<string, unknown>; data: LayoutData }) {
  const id = str(props.id)
  const ratio = /^(\d+)\/(\d+)$/.exec(str(props.ratio))
  const [left, right] = ratio ? [Number(ratio[1]), Number(ratio[2])] : [50, 50]
  const zones = data.zones ?? {}

  return (
    <div style={{ display: 'flex', gap: GAP, width: '100%', flex: 1, minHeight: 30 }}>
      {([['left', left], ['right', right]] as const).map(([side, weight]) => {
        const contents = blocks(zones[`${id}:${side}`])
        return (
          <div key={side} style={{ flex: `${weight} 1 0`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: GAP }}>
            {contents.length
              ? renderAll(contents, data, `${side}`)
              // An empty Split side is a sidebar the owner fills in later, not a
              // mistake - draw the empty well rather than nothing.
              : <div style={{ flex: 1, minHeight: 26, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 3 }} />}
          </div>
        )
      })}
    </div>
  )
}

const SECTION_WIDTH: Record<string, string> = { narrow: '55%', standard: '78%', wide: '92%', full: '100%' }

function SectionPreview({ props, data }: { props: Record<string, unknown>; data: LayoutData }) {
  const width = SECTION_WIDTH[str(props.maxWidth)] ?? '78%'
  const pad = str(props.paddingY) === 'xl' ? 8 : str(props.paddingY) === 'lg' ? 6 : 4
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', flex: 1, padding: `${pad}px 0` }}>
      <div style={{ width, display: 'flex', flexDirection: 'column', gap: GAP, alignItems: 'center', justifyContent: 'center' }}>
        {renderAll(blocks(props.content), data, 's')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const BAND_HEIGHT: Record<string, number> = { '48px': 15, '64px': 20, '80px': 26 }

/** Faint page body drawn behind a header/footer, so the band reads as a band. */
function GhostBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px', opacity: 0.35 }}>
      <div style={bar('55%', 4, 'var(--color-border-strong)', 1, 1)} />
      <div style={bar('100%', 3, 'var(--color-border)', 1, 1)} />
      <div style={bar('85%', 3, 'var(--color-border)', 1, 1)} />
    </div>
  )
}

function Empty() {
  return (
    <div style={{
      flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed var(--color-border-strong)', borderRadius: 3, color: 'var(--color-text-muted)',
      fontSize: '1rem', lineHeight: 1, opacity: 0.5,
    }}>
      +
    </div>
  )
}

export function LayoutPreview({ type, data, height = 104 }: { type: string; data: unknown; height?: number }) {
  const d = (data ?? {}) as LayoutData
  const content = blocks(d.content)
  const rootProps = d.root?.props ?? {}

  const frame: CSSProperties = {
    height,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }

  if (type === 'header' || type === 'footer') {
    const isHeader = type === 'header'
    const heightProp = str(rootProps.height)
    const bandHeight = isHeader ? (BAND_HEIGHT[heightProp] ?? 28) : 24
    const showBorder = (rootProps.border as { show?: string } | undefined)?.show !== 'hide'
    const edge = showBorder ? '1px solid var(--color-border)' : '1px solid transparent'
    const transparent = (rootProps.bg as { mode?: string } | undefined)?.mode === 'transparent-scroll'
    // 1400px headers run wider than the 1200px default: show that as less inset.
    const inset = str(rootProps.maxWidth) === '1400px' ? 6 : 14

    const band = (
      <div style={{
        minHeight: bandHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: `4px ${inset}px`,
        background: transparent ? 'transparent' : 'var(--color-bg-subtle)',
        borderBottom: isHeader ? edge : undefined,
        borderTop: isHeader ? undefined : edge,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: GAP }}>
          {content.length ? renderAll(content, d, 'b') : <Empty />}
        </div>
      </div>
    )

    return (
      <div style={frame}>
        {isHeader ? band : <GhostBody />}
        {isHeader ? <GhostBody /> : band}
      </div>
    )
  }

  return (
    <div style={{ ...frame, gap: GAP, padding: 8 }}>
      {content.length ? renderAll(content, d, 'r') : <Empty />}
    </div>
  )
}
