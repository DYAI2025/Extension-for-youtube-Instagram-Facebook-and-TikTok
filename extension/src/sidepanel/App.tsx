import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from './store'
import { usePlatformListener } from './hooks/usePlatformListener'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { useProfile } from './hooks/useProfile'
import { PlatformBadge } from './components/PlatformBadge'
import { ExtractionProgress } from './components/ExtractionProgress'
import { ResultCard } from './components/ResultCard'
import type { SavedItemType, SavedItemSelection, SavedItemPayload } from './components/ResultCard'
import { ThemeToggle } from './components/ThemeToggle'
import { MemoryView } from './components/memory/MemoryView'
import { AuthView } from './components/AuthView'
import { ProfileView } from './components/ProfileView'
import { NewFolderModal } from './components/NewFolderModal'
import { supabase } from './hooks/useAuth'
import type { OutcomeMode, Pack } from '@shared/types'
import styles from './App.module.css'

const MODE_LABELS: Record<OutcomeMode, string> = {
  'knowledge':      'Knowledge',
  'build-pack':     'Build Pack',
  'decision-pack':  'Decision Pack',
  'coach-notes':    'Coach Notes',
  'tools':          'Tools',
  'stack':          'Tech Stack',
}

export function App() {
  usePlatformListener()
  useAuth()
  useLibrary()
  useProfile()

  const {
    user, theme, view, setView,
    platformState, selectedMode,
    extraction, dismissError,
    latestPack, clearAnalysis,
    addPack, addCollection,
  } = useAppStore()

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [suggestedFolderName, setSuggestedFolderName] = useState<string | undefined>(undefined)
  // Per-artefact selection for the "Save Selected" button. Cleared when the
  // pack changes (new extraction or after a successful save).
  const [selectedItems, setSelectedItems] = useState<Map<string, SavedItemSelection>>(new Map())
  const [savingSelected, setSavingSelected] = useState(false)
  // Toast-style status banner for save / folder operations. `null` when idle.
  const [saveStatus, setSaveStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Reset selection any time the visible pack swaps to a different one.
  useEffect(() => {
    setSelectedItems(new Map())
  }, [latestPack?.id])

  const selectionCount = selectedItems.size

  function toggleSelectItem(key: string, itemType: SavedItemType, payload: SavedItemPayload) {
    setSelectedItems((prev) => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, { itemType, payload })
      return next
    })
  }

  const selectionApi = useMemo(() => ({
    selected: selectedItems,
    toggle: toggleSelectItem,
  }), [selectedItems])

  function handleManualExtract(force = false) {
    console.log('[EXTRACT-DEBUG] sidepanel: Extract button clicked | mode:', selectedMode, '| force:', force)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      console.log('[EXTRACT-DEBUG] sidepanel: active tab | id:', tab?.id, '| url:', tab?.url)
      if (!tab?.id) {
        console.warn('[EXTRACT-DEBUG] sidepanel: no active tab id — aborting')
        return
      }
      console.log('[EXTRACT-DEBUG] sidepanel: sending START_EXTRACTION → background | tabId:', tab.id, '| mode:', selectedMode, '| force:', force)
      chrome.runtime.sendMessage({ type: 'START_EXTRACTION', tabId: tab.id, mode: selectedMode, force }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[EXTRACT-DEBUG] sidepanel: sendMessage error:', chrome.runtime.lastError.message)
        } else {
          console.log('[EXTRACT-DEBUG] sidepanel: sendMessage ack | response:', response)
        }
      })
    })
  }

  function handleClearAnalysis() {
    clearAnalysis()
    setSelectedItems(new Map())
    chrome.runtime.sendMessage({ type: 'CLEAR_ANALYSIS', url: platformState.url }).catch(() => {})
  }

  async function handleSaveSelected() {
    if (!user) { setView('auth'); return }
    if (!latestPack || selectedItems.size === 0 || savingSelected) return
    setSavingSelected(true)
    setSaveStatus(null)
    const rows = Array.from(selectedItems.values()).map((entry) => ({
      user_id: user.id,
      pack_id: savedIds.has(latestPack.id) ? latestPack.id : null,
      item_type: entry.itemType,
      payload: entry.payload,
      video_url: latestPack.url,
      video_title: latestPack.title,
      mode: latestPack.mode,
    }))
    console.log('[SAVE-DEBUG] saved_items: insert | rows:', rows.length, '| types:', rows.map((r) => r.item_type))
    const { error } = await supabase.from('saved_items').insert(rows)
    setSavingSelected(false)
    if (error) {
      console.warn('[SAVE-DEBUG] saved_items: insert failed |', error.message)
      setSaveStatus({ kind: 'err', msg: `Save failed: ${error.message}` })
      return
    }
    console.log('[SAVE-DEBUG] saved_items: insert ok |', rows.length, 'row(s)')
    setSelectedItems(new Map())
    setSaveStatus({ kind: 'ok', msg: `Saved ${rows.length} item${rows.length === 1 ? '' : 's'}.` })
  }

  async function handleSaveFullAnalysis() {
    if (!latestPack) return
    if (savedIds.has(latestPack.id)) return
    await handleSave(latestPack, selectedFolder)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // After a successful sign-in, leave the AuthView so the user lands on their
  // profile (or back on the main panel). Without this, the OAuth popup closes
  // but the AuthView stays visible — making the login feel "stuck".
  useEffect(() => {
    if (user && view === 'auth') {
      console.log('[AUTH-DEBUG] post-login: leaving AuthView')
      setView('profile')
    }
  }, [user, view, setView])

  // Auto-dismiss success banners after 4s. Errors stay until the user closes
  // them so they cannot be missed.
  useEffect(() => {
    if (!saveStatus || saveStatus.kind !== 'ok') return
    const t = setTimeout(() => setSaveStatus(null), 4000)
    return () => clearTimeout(t)
  }, [saveStatus])

  async function handleSave(pack: Pack, folderId: string | null) {
    if (!user) { setView('auth'); return }
    if (savedIds.has(pack.id)) return

    setSaveStatus({ kind: 'ok', msg: 'Saving…' })
    console.log('[SAVE-DEBUG] packs: insert | packId:', pack.id, '| folderId:', folderId, '| hasV2:', !!pack.v2)

    // Build the canonical resources[] for the row column. Prefer v2.resources
    // (validated by the server). When the legacy `important_links` is the only
    // link source, project it into the resource shape so saved rows still
    // surface the links via the resources column.
    const v2 = pack.v2
    const flatResources = v2?.resources?.length
      ? v2.resources
      : (pack.important_links ?? []).map((l) => ({
          title: l.title,
          url: l.url,
          type: 'other' as const,
          mentioned_in_video: false,
          why_relevant: l.description ?? '',
          user_action: '',
          confidence: 'low' as const,
        }))

    // analysis_json keeps the FULL extraction payload — including legacy
    // fields (keywords, relevant_points, quick_facts, important_links) so a
    // future read can fully reconstruct the pack without losing data.
    const analysisJson = {
      ...(v2 ?? {}),
      legacy: {
        keywords: pack.keywords ?? [],
        relevant_points: pack.relevant_points ?? [],
        important_links: pack.important_links ?? [],
        quick_facts: pack.quick_facts ?? null,
      },
    }

    // Normalize every field for the deployed packs schema. Several JSON columns
    // (notably setup_guide, source_coverage, sections, resources, warnings) are
    // NOT NULL — sending `null` violates the constraint. Default to {}/[] so
    // an analysis missing optional fields still saves cleanly. The full
    // unfiltered extraction lives in analysis_json so nothing is lost.
    const packPayload = {
      id: pack.id,
      user_id: user.id,
      title: pack.title || 'Untitled analysis',
      url: pack.url ?? '',
      platform: pack.platform ?? 'youtube',
      mode: pack.mode ?? 'knowledge',
      bullets: pack.key_takeaways ?? [],
      summary: pack.summary ?? '',
      video_explanation: v2?.video_explanation ?? '',
      key_takeaways: pack.key_takeaways ?? [],
      sections: v2?.sections ?? [],
      resources: flatResources ?? [],
      setup_guide: v2?.setup_guide ?? {},
      warnings: v2?.warnings ?? [],
      source_coverage: v2?.source_coverage ?? {},
      analysis_json: analysisJson,
    }
    const { error } = await supabase.from('packs').insert(packPayload)

    if (error) {
      console.warn('[SAVE-DEBUG] packs: insert failed |', error.message)
      setSaveStatus({ kind: 'err', msg: `Save failed: ${error.message}` })
      return
    }

    console.log('[SAVE-DEBUG] packs: insert ok')

    if (folderId) {
      const { error: ciError } = await supabase.from('collection_items').insert({
        collection_id: folderId,
        type: 'pack',
        ref_id: pack.id,
        position: 0,
      })
      if (ciError) {
        console.warn('[SAVE-DEBUG] collection_items: insert failed |', ciError.message)
        setSaveStatus({ kind: 'err', msg: `Saved, but folder link failed: ${ciError.message}` })
        addPack(pack)
        setSavedIds((prev) => new Set(prev).add(pack.id))
        return
      }
      console.log('[SAVE-DEBUG] collection_items: insert ok')
    }

    addPack(pack)
    setSavedIds((prev) => new Set(prev).add(pack.id))
    setSaveStatus({ kind: 'ok', msg: 'Saved.' })
  }

  async function handleCreateFolder(name: string) {
    if (!user) { setView('auth'); return }

    console.log('[SAVE-DEBUG] collections: insert |', { name })
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: user.id, name })
      .select()
      .single()

    if (error) {
      console.warn('[SAVE-DEBUG] collections: insert failed |', error.message)
      setSaveStatus({ kind: 'err', msg: `Create folder failed: ${error.message}` })
      setShowNewFolderModal(false)
      return
    }

    if (data) {
      console.log('[SAVE-DEBUG] collections: insert ok | id-suffix:', String(data.id).slice(0, 8))
      addCollection({ id: data.id, userId: data.user_id, name: data.name, items: [], createdAt: data.created_at })
      setSelectedFolder(data.id)
      setSaveStatus({ kind: 'ok', msg: `Folder "${data.name}" created.` })
    }
    setShowNewFolderModal(false)
  }

  // ─── Views ──────────────────────────────────────────────────────────────────

  if (view === 'auth') {
    return (
      <div className={styles.root}>
        <TopBar onBack={() => setView('main')} title="Account" />
        <AuthView />
      </div>
    )
  }

  if (view === 'library') {
    return (
      <div className={styles.root}>
        <TopBar onBack={() => setView('main')} title="Library" />
        <MemoryView />
      </div>
    )
  }

  if (view === 'profile') {
    return (
      <div className={styles.root}>
        <TopBar onBack={() => setView('main')} title="Profile" />
        <ProfileView />
      </div>
    )
  }

  // ─── No video detected ───────────────────────────────────────────────────────

  if (platformState.platform === 'unknown') {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <span className={styles.logo}>
            <span className={styles.logoMark} aria-hidden="true">
              <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
                <path d="M6.5 1L1.5 6.5H5L3.5 12L8.5 6.5H5L6.5 1Z" fill="white"/>
              </svg>
            </span>
            Extract
          </span>
          <div className={styles.topBarActions}>
            <ThemeToggle />
            <button className={styles.iconBtn} onClick={() => setView('library')} title="Library">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            {user ? (
              <button className={styles.iconBtn} onClick={() => setView('profile')} title={`Profile — ${user.email}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
            ) : (
              <button className={styles.iconBtn} onClick={() => setView('auth')} title="Sign in">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className={styles.content}>
          <p className={styles.hint}>Open a video to get started.</p>
        </div>
      </div>
    )
  }

  // ─── Main view ───────────────────────────────────────────────────────────────

  const isActive = extraction.status === 'extracting' || extraction.status === 'recording'

  // Only show result card when there is actual visible content — not just a title
  const hasContent = !!latestPack && (
    !!latestPack.summary ||
    (latestPack.key_takeaways?.length ?? 0) > 0 ||
    (latestPack.relevant_points?.length ?? 0) > 0 ||
    (latestPack.important_links?.length ?? 0) > 0
  )

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <span className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">
            <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
              <path d="M6.5 1L1.5 6.5H5L3.5 12L8.5 6.5H5L6.5 1Z" fill="white"/>
            </svg>
          </span>
          Extract
        </span>
        <div className={styles.topBarActions}>
          <ThemeToggle />
          <button className={styles.iconBtn} onClick={() => setView('library')} title="Library">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          {user ? (
            <button className={styles.iconBtn} onClick={() => setView('profile')} title={`Profile — ${user.email}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          ) : (
            <button className={styles.iconBtn} onClick={() => setView('auth')} title="Sign in">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        <PlatformBadge
          platform={platformState.platform}
          strategy={platformState.strategy}
          title={platformState.title}
        />

        {/* Mode badge — hidden while active */}
        {!isActive && (
          <div className={styles.modeBadge}>
            <span className={styles.modeName}>{MODE_LABELS[selectedMode]}</span>
          </div>
        )}

        {/* Extract button — hidden while active. Force re-analyze when content already exists. */}
        {!isActive && !hasContent && (
          <button className={styles.extractBtn} onClick={() => handleManualExtract(false)}>
            Extract
          </button>
        )}
        {!isActive && hasContent && latestPack && (
          <div className={styles.actionGrid}>
            <button className={styles.extractBtn} onClick={() => handleManualExtract(true)}>
              New Analysis
            </button>
            <button className={styles.secondaryBtn} onClick={handleClearAnalysis}>
              Clear
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={handleSaveSelected}
              disabled={selectionCount === 0 || savingSelected}
              title={selectionCount === 0 ? 'Select takeaways or links first' : `Save ${selectionCount} item(s)`}
            >
              {savingSelected ? 'Saving…' : `Save Selected${selectionCount > 0 ? ` (${selectionCount})` : ''}`}
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={handleSaveFullAnalysis}
              disabled={savedIds.has(latestPack.id)}
              title="Save the full analysis to your library"
            >
              {savedIds.has(latestPack.id) ? 'Saved ✓' : 'Save Full Analysis'}
            </button>
          </div>
        )}

        {saveStatus && (
          <div
            className={saveStatus.kind === 'err' ? styles.saveBanner + ' ' + styles.saveBannerErr : styles.saveBanner}
            role={saveStatus.kind === 'err' ? 'alert' : 'status'}
          >
            <span>{saveStatus.msg}</span>
            <button
              type="button"
              className={styles.saveBannerClose}
              onClick={() => setSaveStatus(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Extracting, no prior real content → full skeleton */}
        {extraction.status === 'extracting' && !hasContent && (
          <div className={styles.liveCard}>
            <p className={styles.liveTitle}>{platformState.title}</p>
            <div className={styles.skeletonGroup}>
              {[88, 72, 80].map((w, i) => <div key={i} className={styles.skeletonLine} style={{ width: `${w}%`, animationDelay: `${i * 180}ms` }} />)}
            </div>
            <div className={styles.skeletonGroup}>
              {[90, 68, 82, 75, 60].map((w, i) => <div key={i} className={styles.skeletonBulletLine} style={{ width: `${w}%`, animationDelay: `${i * 140}ms` }} />)}
            </div>
            <ExtractionProgress percent={extraction.percent} statusText={extraction.statusText || 'Analysiere…'} />
          </div>
        )}

        {/* Extracting with existing result → slim progress bar only (result stays visible below) */}
        {extraction.status === 'extracting' && hasContent && (
          <ExtractionProgress percent={extraction.percent} statusText={extraction.statusText || 'Aktualisiere…'} />
        )}

        {/* Recording → indicator + stop button (result stays visible below if it exists) */}
        {extraction.status === 'recording' && (
          <div className={styles.liveCard}>
            <p className={styles.liveTitle}>{platformState.title}</p>
            <p className={styles.recordingIndicator}>&#9679; Recording…</p>
            <button className={styles.extractBtn} onClick={() => handleManualExtract(false)}>
              Stop &amp; Analyze
            </button>
          </div>
        )}

        {/* Result card — only shown when real content exists (summary / takeaways / points / links) */}
        {hasContent && latestPack && (
          <ResultCard
            pack={latestPack}
            isSaved={savedIds.has(latestPack.id)}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            onCreateFolder={() => { setSuggestedFolderName(latestPack.title); setShowNewFolderModal(true) }}
            suggestedFolderName={suggestedFolderName}
            selection={selectionApi}
          />
        )}

        {/* Hint — only when no real content and idle */}
        {!hasContent && extraction.status === 'idle' && (
          <p className={styles.hint}>
            {platformState.strategy === 'instant'
              ? 'Click Extract to analyze this video.'
              : 'Click Extract to start recording audio.'}
          </p>
        )}

        {/* Error state */}
        {extraction.status === 'error' && (
          <div>
            {extraction.isHint ? (
              <p className={styles.hintText}>{extraction.error}</p>
            ) : (
              <p className={styles.errorText}>{extraction.error}</p>
            )}
            <button className={styles.retryBtn} onClick={dismissError}>Dismiss</button>
          </div>
        )}
      </div>

      {showNewFolderModal && (
        <NewFolderModal
          suggestedName={suggestedFolderName}
          onConfirm={handleCreateFolder}
          onCancel={() => setShowNewFolderModal(false)}
        />
      )}
    </div>
  )
}

// ─── TopBar helper ────────────────────────────────────────────────────────────

function TopBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className={styles.topBar}>
      <button className={styles.backBtn} onClick={onBack}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
      <span className={styles.topBarTitle}>{title}</span>
    </div>
  )
}
