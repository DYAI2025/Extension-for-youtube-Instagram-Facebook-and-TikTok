import type { Pack, AttachedLink, VideoSection } from '@shared/types'

// ─── Minimal PDF writer (no third-party dependency) ──────────────────────────
// Produces a Letter-size (612×792pt) PDF with Helvetica + Helvetica-Bold and
// automatic line wrapping / pagination. Restricted to characters in
// WinAnsiEncoding — anything else is normalized via `sanitize()` to keep the
// stream parseable by every PDF reader.
//
// The full pack is rendered: title, metadata, summary, key takeaways, topic
// sections (with related links), setup guide / commands, source coverage.
// Filename is derived from the pack title and is sanitized.
//
// No tokens, internal IDs, or secrets are written into the PDF.

type Style = 'regular' | 'bold'

interface Op {
  kind: 'text'
  font: Style
  size: number
  text: string
  /** extra leading (vertical space) AFTER this line */
  spaceAfter?: number
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2
const TOP_Y = PAGE_H - MARGIN
const BOTTOM_Y = MARGIN

// Average Helvetica char width as a fraction of font size. Conservative so
// long words still fit. Used only for soft wrapping — over-estimating just
// produces shorter lines.
const CHAR_W = 0.52

function safeFilename(title: string): string {
  const base = (title || 'analysis').normalize('NFKD').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const today = new Date().toISOString().slice(0, 10)
  return `extract-${base.slice(0, 80) || 'analysis'}-${today}.pdf`
}

// PDF strings can only contain bytes 32–126 reliably (WinAnsi). Replace common
// unicode punctuation and strip everything else. Any byte outside Latin-1 is
// dropped so the content stream stays valid.
function sanitize(input: string): string {
  if (!input) return ''
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

// PDF literal string: escape (, ), \\
function pdfString(s: string): string {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'
}

function wrapLine(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const charBudget = Math.max(8, Math.floor(maxWidth / (fontSize * CHAR_W)))
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? current + ' ' + w : w
    if (candidate.length > charBudget && current) {
      lines.push(current)
      current = w
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function buildOps(pack: Pack): Op[] {
  const ops: Op[] = []
  const v2 = pack.v2
  const generated = new Date().toISOString()

  ops.push({ kind: 'text', font: 'bold', size: 18, text: sanitize(pack.title || 'Untitled analysis'), spaceAfter: 6 })
  ops.push({ kind: 'text', font: 'regular', size: 9, text: sanitize(`Source: ${pack.url}`), spaceAfter: 2 })
  ops.push({
    kind: 'text',
    font: 'regular',
    size: 9,
    text: sanitize(`Platform: ${pack.platform} • Mode: ${pack.mode} • Generated: ${generated}`),
    spaceAfter: 12,
  })

  const summary = v2?.summary ?? pack.summary
  if (summary) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: 'Summary', spaceAfter: 4 })
    ops.push({ kind: 'text', font: 'regular', size: 11, text: sanitize(summary), spaceAfter: 8 })
  }

  if (v2?.video_explanation) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: 'About this video', spaceAfter: 4 })
    ops.push({ kind: 'text', font: 'regular', size: 11, text: sanitize(v2.video_explanation), spaceAfter: 10 })
  }

  const takeaways = v2?.key_takeaways ?? pack.key_takeaways ?? []
  if (takeaways.length > 0) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: 'Key takeaways', spaceAfter: 4 })
    takeaways.forEach((t, i) => {
      ops.push({ kind: 'text', font: 'regular', size: 11, text: sanitize(`${i + 1}. ${t}`), spaceAfter: 2 })
      const links = v2?.key_takeaway_links?.[i] ?? []
      links.forEach((l) => appendLinkOps(ops, l, 24))
    })
    ops.push({ kind: 'text', font: 'regular', size: 1, text: '', spaceAfter: 8 })
  }

  if (v2?.sections && v2.sections.length > 0) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: 'Topics', spaceAfter: 4 })
    v2.sections.forEach((sec, i) => appendSectionOps(ops, sec, i))
  }

  if (v2?.setup_guide?.exists) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: sanitize(v2.setup_guide.title || 'Setup guide'), spaceAfter: 4 })
    if (v2.setup_guide.prerequisites?.length) {
      ops.push({ kind: 'text', font: 'bold', size: 10, text: 'Prerequisites', spaceAfter: 2 })
      v2.setup_guide.prerequisites.forEach((p) =>
        ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(`• ${p}`), spaceAfter: 1 }),
      )
    }
    if (v2.setup_guide.steps?.length) {
      ops.push({ kind: 'text', font: 'bold', size: 10, text: 'Steps', spaceAfter: 2 })
      v2.setup_guide.steps.forEach((s) => {
        ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(`${s.order}. ${s.description}`), spaceAfter: 1 })
        if (s.command) ops.push({ kind: 'text', font: 'regular', size: 9, text: sanitize(`   $ ${s.command}`), spaceAfter: 1 })
      })
    }
    if (v2.setup_guide.commands?.length) {
      ops.push({ kind: 'text', font: 'bold', size: 10, text: 'Commands', spaceAfter: 2 })
      v2.setup_guide.commands.forEach((c) =>
        ops.push({ kind: 'text', font: 'regular', size: 9, text: sanitize(`$ ${c}`), spaceAfter: 1 }),
      )
    }
    if (v2.setup_guide.warnings?.length) {
      ops.push({ kind: 'text', font: 'bold', size: 10, text: 'Warnings', spaceAfter: 2 })
      v2.setup_guide.warnings.forEach((w) =>
        ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(`• ${w}`), spaceAfter: 1 }),
      )
    }
    ops.push({ kind: 'text', font: 'regular', size: 1, text: '', spaceAfter: 8 })
  }

  if (v2?.unassigned_resources?.length) {
    ops.push({ kind: 'text', font: 'bold', size: 12, text: 'Other resources', spaceAfter: 4 })
    v2.unassigned_resources.forEach((r) => {
      ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(`• ${r.title} — ${r.url}`), spaceAfter: 1 })
      if (r.why_relevant) ops.push({ kind: 'text', font: 'regular', size: 9, text: sanitize(`   ${r.why_relevant}`), spaceAfter: 2 })
    })
    ops.push({ kind: 'text', font: 'regular', size: 1, text: '', spaceAfter: 6 })
  }

  if (v2?.source_coverage) {
    const sc = v2.source_coverage
    ops.push({ kind: 'text', font: 'bold', size: 11, text: 'Source coverage', spaceAfter: 3 })
    ops.push({
      kind: 'text',
      font: 'regular',
      size: 9,
      text: sanitize(
        `Source: ${sc.extraction_source} • Scope: ${sc.extraction_scope} • Confidence: ${sc.confidence}` +
          (sc.transcript_available ? ' • Transcript available' : ''),
      ),
      spaceAfter: 2,
    })
    if (sc.limitations?.length) {
      sc.limitations.forEach((l) =>
        ops.push({ kind: 'text', font: 'regular', size: 9, text: sanitize(`• ${l}`), spaceAfter: 1 }),
      )
    }
  }

  return ops
}

function appendSectionOps(ops: Op[], section: VideoSection, index: number) {
  const tsLabel = formatTimestamp(section.timestamp_seconds)
  const heading = tsLabel
    ? `${index + 1}. ${section.title} (${tsLabel})`
    : `${index + 1}. ${section.title}`
  ops.push({ kind: 'text', font: 'bold', size: 11, text: sanitize(heading), spaceAfter: 2 })
  if (section.summary) ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(section.summary), spaceAfter: 2 })
  section.key_points?.forEach((kp) =>
    ops.push({ kind: 'text', font: 'regular', size: 10, text: sanitize(`• ${kp}`), spaceAfter: 1 }),
  )
  section.related_links?.forEach((l) => appendLinkOps(ops, l, 12))
  ops.push({ kind: 'text', font: 'regular', size: 1, text: '', spaceAfter: 6 })
}

function appendLinkOps(ops: Op[], link: AttachedLink, indent: number) {
  const ts = link.timestamp ? `[${link.timestamp}] ` : ''
  ops.push({
    kind: 'text',
    font: 'regular',
    size: 9,
    text: sanitize(`${' '.repeat(Math.max(0, Math.floor(indent / 4)))}↳ ${ts}${link.title} — ${link.url}`),
    spaceAfter: 1,
  })
  if (link.why_relevant_here) {
    ops.push({
      kind: 'text',
      font: 'regular',
      size: 9,
      text: sanitize(`${' '.repeat(Math.max(0, Math.floor(indent / 4)))}  ${link.why_relevant_here}`),
      spaceAfter: 1,
    })
  }
}

function formatTimestamp(seconds: number | undefined): string | null {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return null
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

interface PageStream {
  text: string
}

function renderPages(ops: Op[]): PageStream[] {
  const pages: PageStream[] = []
  let body = ''
  let y = TOP_Y
  let pageHasContent = false

  const newPage = () => {
    if (pageHasContent) pages.push({ text: body })
    body = ''
    y = TOP_Y
    pageHasContent = false
  }

  for (const op of ops) {
    const lines = wrapLine(op.text, op.size, CONTENT_W)
    const lineHeight = op.size * 1.25
    for (const line of lines) {
      if (y - lineHeight < BOTTOM_Y) newPage()
      const fontRef = op.font === 'bold' ? '/F2' : '/F1'
      body += `BT ${fontRef} ${op.size} Tf ${MARGIN} ${y - op.size} Td ${pdfString(line)} Tj ET\n`
      y -= lineHeight
      pageHasContent = true
    }
    if (op.spaceAfter) y -= op.spaceAfter
  }
  if (pageHasContent) pages.push({ text: body })
  if (pages.length === 0) pages.push({ text: '' })
  return pages
}

function buildPdf(pages: PageStream[]): Uint8Array {
  // Object layout (1-indexed):
  //   1: Catalog
  //   2: Pages
  //   3..(2+N): Page objects
  //   (3+N)..(2+2N): Content streams
  //   (3+2N): Helvetica
  //   (4+2N): Helvetica-Bold
  const N = pages.length
  const pageStartId = 3
  const contentStartId = pageStartId + N
  const fontRegularId = contentStartId + N
  const fontBoldId = fontRegularId + 1
  const totalObjects = fontBoldId

  const objects: string[] = []
  // 1: Catalog
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`)
  // 2: Pages
  const kids = pages.map((_, i) => `${pageStartId + i} 0 R`).join(' ')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`)
  // 3..(2+N): Page objects
  for (let i = 0; i < N; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
        `/Contents ${contentStartId + i} 0 R >>`,
    )
  }
  // Content streams
  for (let i = 0; i < N; i++) {
    const stream = pages[i].text
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  }
  // Fonts
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)

  // Assemble file with byte offsets for xref
  const header = '%PDF-1.4\n%\xff\xff\xff\xff\n'
  let body = header
  const offsets: number[] = []
  for (let i = 0; i < totalObjects; i++) {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefOffset = body.length
  body += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`
  for (let i = 0; i < totalObjects; i++) {
    body += offsets[i].toString().padStart(10, '0') + ' 00000 n \n'
  }
  body += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  // Latin-1 encode (covers all WinAnsi bytes we emit)
  const bytes = new Uint8Array(body.length)
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff
  return bytes
}

export function exportPackToPdf(pack: Pack): void {
  try {
    console.log('[EXPORT-DEBUG] pdf | packId-suffix:', pack.id.slice(-6))
    const ops = buildOps(pack)
    const pages = renderPages(ops)
    const pdfBytes = buildPdf(pages)
    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    const blob = new Blob([buffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeFilename(pack.title)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    console.log('[EXPORT-DEBUG] pdf: ok | pages:', pages.length, '| bytes:', pdfBytes.length)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.warn('[EXPORT-DEBUG] pdf: failed |', msg)
  }
}
