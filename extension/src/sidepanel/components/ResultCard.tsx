import { useState } from 'react'
import type { AttachedLink, Pack, Resource, VideoSection } from '@shared/types'
import { useAppStore } from '../store'
import styles from './ResultCard.module.css'

// Allowed item_type values for saved_items, mirrored from the Supabase check
// constraint. Keep in sync with migration 005.
export type SavedItemType =
  | 'takeaway'
  | 'section'
  | 'resource'
  | 'setup_step'
  | 'command'
  | 'full_analysis'

// Normalized shape stored in saved_items.payload. Keeps the verbatim
// `raw` artefact (lossless round-trip), plus a flat read-model used by the
// library and PDF export so they don't need to know about every artefact
// shape.
export interface SavedItemPayload {
  title: string
  content?: string
  resource_url?: string
  context?: string
  metadata?: Record<string, unknown>
  raw: unknown
}

export interface SavedItemSelection {
  itemType: SavedItemType
  payload: SavedItemPayload
}

function buildResourcePayload(
  link: AttachedLink,
  matchedResource: Resource | undefined,
  context: string,
): SavedItemPayload {
  return {
    title: link.title || matchedResource?.title || link.url,
    content: link.why_relevant_here || matchedResource?.why_relevant || link.description || '',
    resource_url: link.url,
    context,
    metadata: {
      source: link.source,
      timestamp: link.timestamp,
      confidence: link.confidence ?? matchedResource?.confidence,
      type: matchedResource?.type,
      user_action: link.user_action ?? matchedResource?.user_action,
    },
    raw: matchedResource ?? link,
  }
}

function buildTakeawayPayload(text: string, index: number): SavedItemPayload {
  return {
    title: text.slice(0, 80),
    content: text,
    context: `Takeaway #${index + 1}`,
    metadata: { takeaway_index: index },
    raw: { text },
  }
}

function buildSectionPayload(section: VideoSection, index: number): SavedItemPayload {
  return {
    title: section.title,
    content: section.summary,
    context: `Topic block #${index + 1}`,
    metadata: {
      section_index: index,
      timestamp_seconds: section.timestamp_seconds,
      semantic_keywords: section.semantic_keywords,
    },
    raw: section,
  }
}

function buildSetupStepPayload(step: { description: string; command?: string }, index: number): SavedItemPayload {
  return {
    title: step.description.slice(0, 80),
    content: step.description,
    context: `Setup step #${index + 1}`,
    metadata: { command: step.command },
    raw: step,
  }
}

function buildCommandPayload(command: string, index: number): SavedItemPayload {
  return {
    title: command.slice(0, 80),
    content: command,
    context: `Command #${index + 1}`,
    metadata: { command_index: index },
    raw: { command },
  }
}

export interface SelectionApi {
  selected: Map<string, SavedItemSelection>
  toggle: (key: string, itemType: SavedItemType, payload: SavedItemPayload) => void
}

interface Props {
  pack: Pack
  isSaved: boolean
  selectedFolder: string | null
  onFolderChange: (id: string | null) => void
  onCreateFolder: () => void
  suggestedFolderName?: string
  selection?: SelectionApi
}

export function ResultCard({ pack, isSaved, selectedFolder, onFolderChange, onCreateFolder, suggestedFolderName, selection }: Props) {
  // Render the entire pack immediately. The previous setInterval/setTimeout
  // staggered reveal froze whenever Chrome backgrounded the side panel — so
  // the full breakdown only "appeared" after the user clicked the panel
  // again. CSS-driven fadeIn keeps the visual polish without depending on
  // JS timers that the browser pauses in inactive tabs.
  console.log('[RENDER-DEBUG] ResultCard | packId:', pack.id, '| takeaways:', pack.key_takeaways?.length ?? 0, '| sections:', pack.v2?.sections?.length ?? 0)

  const visibleBullets = pack.key_takeaways
  const showDetails = true
  const showLinks = true

  const sel = selection
  const isItemSelected = (key: string) => !!sel?.selected.has(key)

  // Compute the "Other resources" fallback. Prefer the server-assigned
  // unassigned_resources; otherwise use legacy important_links so packs
  // saved before this change continue to render their links.
  const v2 = pack.v2
  const unassignedResources: Resource[] = v2?.unassigned_resources ?? []
  const legacyFallbackLinks =
    !v2 && pack.important_links?.length ? pack.important_links : []
  const showFallbackBlock = unassignedResources.length > 0 || legacyFallbackLinks.length > 0

  const findResourceForUrl = (url: string): Resource | undefined =>
    v2?.resources?.find((r) => r.url === url)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          <p className={styles.title}>{pack.title}</p>
          <p className={styles.meta}>{pack.mode} · {pack.platform}</p>
          <ScopeBadge pack={pack} />
        </div>
        {isSaved && <span className={`${styles.saveBtn} ${styles.saved}`} aria-label="Saved">✓</span>}
      </div>

      {pack.summary && (
        <p className={`${styles.summary} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          {pack.summary}
        </p>
      )}

      {pack.keywords && pack.keywords.length > 0 && (
        <div className={`${styles.keywords} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          {pack.keywords.map((k, i) => (
            <span key={i} className={styles.keyword}>{k}</span>
          ))}
        </div>
      )}

      {visibleBullets.length > 0 && (
        <ul className={styles.bullets}>
          {visibleBullets.map((b, i) => {
            const key = `takeaway:${i}`
            const checked = isItemSelected(key)
            const attached = v2?.key_takeaway_links?.[i] ?? []
            return (
              <li
                key={i}
                className={`${styles.bullet} ${styles.fadeIn} ${checked ? styles.bulletSelected : ''}`}
                style={{ '--delay': '0ms' } as React.CSSProperties}
              >
                {sel && (
                  <input
                    type="checkbox"
                    className={styles.itemCheckbox}
                    checked={checked}
                    onChange={() => sel.toggle(key, 'takeaway', buildTakeawayPayload(b, i))}
                    aria-label="Select takeaway"
                  />
                )}
                <div className={styles.bulletBody}>
                  <span className={styles.bulletText}>{b}</span>
                  {attached.length > 0 && (
                    <div className={styles.relatedLinks}>
                      {attached.map((link, j) => {
                        const linkKey = `takeaway-link:${i}:${j}:${link.url}`
                        const linkChecked = isItemSelected(linkKey)
                        const matchedResource = findResourceForUrl(link.url)
                        const linkContext = `Takeaway #${i + 1}: ${b.slice(0, 60)}`
                        return (
                          <RelatedLinkCard
                            key={linkKey}
                            link={link}
                            checked={linkChecked}
                            onToggle={sel ? () => sel.toggle(linkKey, 'resource', buildResourcePayload(link, matchedResource, linkContext)) : undefined}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {showDetails && v2?.sections && v2.sections.length > 0 && (
        <div className={`${styles.topicBlocks} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          <p className={styles.sectionLabel}>Topic blocks</p>
          {v2.sections.map((section, i) => (
            <TopicBlock
              key={i}
              section={section}
              index={i}
              sel={sel}
              isItemSelected={isItemSelected}
              findResourceForUrl={findResourceForUrl}
            />
          ))}
        </div>
      )}

      {showDetails && (!v2?.sections || v2.sections.length === 0) && pack.relevant_points && pack.relevant_points.length > 0 && (
        <div className={`${styles.relevantPoints} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          <p className={styles.sectionLabel}>Details</p>
          <ul className={styles.bullets} style={{ borderTop: 'none', paddingTop: 0 }}>
            {pack.relevant_points.map((p, i) => (
              <li key={i} className={`${styles.bullet} ${styles.bulletMuted}`}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {showDetails && pack.quick_facts && (
        <div className={`${styles.quickFacts} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          <p className={styles.sectionLabel}>Quick facts</p>
          <div className={styles.quickFactsRow}>
            {pack.quick_facts.platform && <span className={styles.factPill}>{pack.quick_facts.platform}</span>}
            {pack.quick_facts.category && <span className={styles.factPill}>{pack.quick_facts.category}</span>}
            {pack.quick_facts.content_type && <span className={styles.factPill}>{pack.quick_facts.content_type}</span>}
          </div>
        </div>
      )}

      {showLinks && showFallbackBlock && (
        <div className={`${styles.links} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          <p className={styles.fallbackHeader}>Other resources</p>
          {unassignedResources.length > 0
            ? unassignedResources.map((res, i) => {
                const key = `resource:unassigned:${i}:${res.url}`
                const checked = isItemSelected(key)
                return (
                  <div key={i} className={`${styles.linkRow} ${checked ? styles.bulletSelected : ''}`}>
                    {sel && (
                      <input
                        type="checkbox"
                        className={styles.itemCheckbox}
                        checked={checked}
                        onChange={() => sel.toggle(key, 'resource', {
                          title: res.title,
                          content: res.why_relevant ?? '',
                          resource_url: res.url,
                          context: 'Other resources',
                          metadata: {
                            type: res.type,
                            confidence: res.confidence,
                            mentioned_in_video: res.mentioned_in_video,
                            mentioned_context: res.mentioned_context,
                            user_action: res.user_action,
                          },
                          raw: res,
                        })}
                        aria-label="Select resource"
                      />
                    )}
                    <a href={res.url} target="_blank" rel="noreferrer" className={styles.link}>
                      <ExternalLinkIcon />
                      <span className={styles.linkContent}>
                        <span className={styles.linkTitle}>
                          {res.title}
                          {renderUrlStatusBadge(res.validation, styles)}
                        </span>
                        {res.why_relevant && <span className={styles.linkDesc}>{res.why_relevant}</span>}
                      </span>
                    </a>
                  </div>
                )
              })
            : legacyFallbackLinks.map((link, i) => {
                const key = `link:${i}:${link.url}`
                const checked = isItemSelected(key)
                return (
                  <div key={i} className={`${styles.linkRow} ${checked ? styles.bulletSelected : ''}`}>
                    {sel && (
                      <input
                        type="checkbox"
                        className={styles.itemCheckbox}
                        checked={checked}
                        onChange={() => sel.toggle(key, 'resource', {
                          title: link.title,
                          content: link.description ?? '',
                          resource_url: link.url,
                          context: 'Other resources',
                          metadata: {},
                          raw: link,
                        })}
                        aria-label="Select resource"
                      />
                    )}
                    <a href={link.url} target="_blank" rel="noreferrer" className={styles.link}>
                      <ExternalLinkIcon />
                      <span className={styles.linkContent}>
                        <span className={styles.linkTitle}>{link.title}</span>
                        {link.description && <span className={styles.linkDesc}>{link.description}</span>}
                      </span>
                    </a>
                  </div>
                )
              })}
        </div>
      )}

      {showLinks && pack.v2?.setup_guide?.exists && (
        (pack.v2.setup_guide.steps?.length ?? 0) + (pack.v2.setup_guide.commands?.length ?? 0) > 0
      ) && (
        <div className={`${styles.setupGuide} ${styles.fadeIn}`} style={{ '--delay': '0ms' } as React.CSSProperties}>
          <p className={styles.sectionLabel}>{pack.v2.setup_guide.title ?? 'Setup'}</p>

          {pack.v2.setup_guide.steps && pack.v2.setup_guide.steps.length > 0 && (
            <ul className={styles.bullets} style={{ borderTop: 'none', paddingTop: 0 }}>
              {pack.v2.setup_guide.steps.map((step, i) => {
                const key = `setup_step:${i}`
                const checked = isItemSelected(key)
                const stepLabel = step.command
                  ? `${step.description} — \`${step.command}\``
                  : step.description
                return (
                  <li
                    key={i}
                    className={`${styles.bullet} ${styles.bulletMuted} ${checked ? styles.bulletSelected : ''}`}
                  >
                    {sel && (
                      <input
                        type="checkbox"
                        className={styles.itemCheckbox}
                        checked={checked}
                        onChange={() => sel.toggle(key, 'setup_step', buildSetupStepPayload(step, i))}
                        aria-label="Select setup step"
                      />
                    )}
                    <span className={styles.bulletText}>{stepLabel}</span>
                  </li>
                )
              })}
            </ul>
          )}

          {pack.v2.setup_guide.commands && pack.v2.setup_guide.commands.length > 0 && (
            <div className={styles.commands}>
              {pack.v2.setup_guide.commands.map((cmd, i) => {
                const key = `command:${i}:${cmd}`
                const checked = isItemSelected(key)
                return (
                  <div key={i} className={`${styles.commandRow} ${checked ? styles.bulletSelected : ''}`}>
                    {sel && (
                      <input
                        type="checkbox"
                        className={styles.itemCheckbox}
                        checked={checked}
                        onChange={() => sel.toggle(key, 'command', buildCommandPayload(cmd, i))}
                        aria-label="Select command"
                      />
                    )}
                    <code className={styles.commandText}>{cmd}</code>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!isSaved && (
        <div className={styles.saveRow}>
          <FolderPicker
            selected={selectedFolder}
            onSelect={onFolderChange}
            onCreateNew={onCreateFolder}
            suggestedName={suggestedFolderName}
          />
        </div>
      )}
    </div>
  )
}

// ─── Scope badge ──────────────────────────────────────────────────────────────

function ScopeBadge({ pack }: { pack: Pack }) {
  const sc = pack.v2?.source_coverage
  if (!sc) return null
  const scope = sc.extraction_scope
  const transcriptOk = sc.transcript_available
  const limitations = sc.limitations ?? []

  if (scope === 'full_video' && transcriptOk) {
    return <span className={`${styles.scopeBadge} ${styles.scopeFull}`}>Full video analysis</span>
  }
  const reason = limitations[0] ?? 'Transcript was unavailable — analysis may be partial.'
  return (
    <span className={`${styles.scopeBadge} ${styles.scopePartial}`} title={reason}>
      Partial analysis
    </span>
  )
}

// ─── Topic block (one section rendered as a topic card) ───────────────────────

function TopicBlock({
  section,
  index,
  sel,
  isItemSelected,
  findResourceForUrl,
}: {
  section: VideoSection
  index: number
  sel: SelectionApi | undefined
  isItemSelected: (key: string) => boolean
  findResourceForUrl: (url: string) => Resource | undefined
}) {
  const sectionKey = `section:${index}`
  const sectionChecked = isItemSelected(sectionKey)
  const ts = formatTimestamp(section.timestamp_seconds)

  return (
    <div className={`${styles.topicBlock} ${sectionChecked ? styles.bulletSelected : ''}`}>
      <div className={styles.topicHeader}>
        {sel && (
          <input
            type="checkbox"
            className={styles.itemCheckbox}
            checked={sectionChecked}
            onChange={() => sel.toggle(sectionKey, 'section', buildSectionPayload(section, index))}
            aria-label="Select topic block"
          />
        )}
        <div className={styles.topicHeaderText}>
          <p className={styles.topicTitle}>
            {ts && <span className={styles.topicTimestamp}>{ts}</span>}
            {section.title}
          </p>
          {section.summary && <p className={styles.topicSummary}>{section.summary}</p>}
        </div>
      </div>

      {section.semantic_keywords && section.semantic_keywords.length > 0 && (
        <div className={styles.topicKeywords}>
          {section.semantic_keywords.map((kw, j) => (
            <span key={j} className={styles.topicKeyword}>{kw}</span>
          ))}
        </div>
      )}

      {section.key_points && section.key_points.length > 0 && (
        <ul className={styles.topicPoints}>
          {section.key_points.map((point, j) => (
            <li key={j} className={`${styles.bullet} ${styles.bulletMuted}`}>
              <span className={styles.bulletText}>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {section.related_links && section.related_links.length > 0 && (
        <div className={styles.relatedLinks}>
          {section.related_links.map((link, j) => {
            const linkKey = `section-link:${index}:${j}:${link.url}`
            const linkChecked = isItemSelected(linkKey)
            const matchedResource = findResourceForUrl(link.url)
            const linkContext = `Topic: ${section.title}`
            return (
              <RelatedLinkCard
                key={linkKey}
                link={link}
                checked={linkChecked}
                onToggle={sel ? () => sel.toggle(linkKey, 'resource', buildResourcePayload(link, matchedResource, linkContext)) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatTimestamp(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return null
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    return `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Related link card (inline under bullets) ─────────────────────────────────

function RelatedLinkCard({
  link,
  checked,
  onToggle,
}: {
  link: AttachedLink
  checked: boolean
  onToggle?: () => void
}) {
  return (
    <div className={`${styles.relatedLinkCard} ${checked ? styles.relatedLinkSelected : ''}`}>
      {onToggle && (
        <input
          type="checkbox"
          className={styles.itemCheckbox}
          checked={checked}
          onChange={onToggle}
          aria-label="Select related link"
        />
      )}
      <div className={styles.relatedLinkBody}>
        <a href={link.url} target="_blank" rel="noreferrer" className={styles.relatedLinkAnchor}>
          <ExternalLinkIcon />
          <span className={styles.relatedLinkTitle}>{link.title}</span>
          {link.timestamp && (
            <span className={styles.relatedLinkTimestamp}>@ {link.timestamp}</span>
          )}
          {renderUrlStatusBadge(link.url_status, styles)}
        </a>
        {link.source && link.source.startsWith('youtube_description') && (
          <span className={styles.relatedLinkSource}>From video description</span>
        )}
        {link.description && <span className={styles.relatedLinkDesc}>{link.description}</span>}
        {link.why_relevant_here && (
          <span className={styles.relatedLinkWhy}>{link.why_relevant_here}</span>
        )}
        {link.user_action && (
          <span className={styles.relatedLinkAction}>→ {link.user_action}</span>
        )}
      </div>
    </div>
  )
}

function ExternalLinkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function renderUrlStatusBadge(
  status: string | undefined,
  s: typeof styles,
) {
  if (!status) return null
  if (status === 'valid') {
    return <span className={`${s.urlStatusBadge} ${s.urlStatusValid}`}>OK</span>
  }
  if (status === 'invalid') {
    return <span className={`${s.urlStatusBadge} ${s.urlStatusInvalid}`}>Broken</span>
  }
  if (status === 'redirected') {
    return <span className={`${s.urlStatusBadge} ${s.urlStatusRedirect}`}>Redirect</span>
  }
  if (status === 'unverified') {
    return (
      <span
        className={`${s.urlStatusBadge} ${s.urlStatusUnverified ?? s.urlStatusRedirect}`}
        title="Could not verify this link via the GitHub API. Open it carefully and confirm the repository exists."
      >
        Unverified
      </span>
    )
  }
  return null
}

// ─── Folder picker ─────────────────────────────────────────────────────────────

function FolderPicker({ selected, onSelect, onCreateNew, suggestedName }: {
  selected: string | null
  onSelect: (id: string | null) => void
  onCreateNew: () => void
  suggestedName?: string
}) {
  const { collections } = useAppStore()
  const [open, setOpen] = useState(false)
  const label = selected ? (collections.find((c) => c.id === selected)?.name ?? 'Folder') : 'No folder'

  return (
    <div className={styles.fpRoot}>
      <button className={styles.fpTrigger} onClick={() => setOpen(!open)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '150ms' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className={styles.fpDropdown}>
          <button className={`${styles.fpOption} ${!selected ? styles.fpActive : ''}`} onClick={() => { onSelect(null); setOpen(false) }}>No folder</button>
          {collections.map((c) => (
            <button key={c.id} className={`${styles.fpOption} ${selected === c.id ? styles.fpActive : ''}`} onClick={() => { onSelect(c.id); setOpen(false) }}>{c.name}</button>
          ))}
          <div className={styles.fpDivider} />
          <button className={styles.fpCreate} onClick={() => { onCreateNew(); setOpen(false) }}>
            {suggestedName ? `+ New: ${suggestedName}` : '+ New folder'}
          </button>
        </div>
      )}
    </div>
  )
}
