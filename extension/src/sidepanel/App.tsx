import { useState, useEffect } from 'react'
import { useAppStore } from './store'
import { usePlatformListener } from './hooks/usePlatformListener'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { PlatformBadge } from './components/PlatformBadge'
import { ExtractionProgress } from './components/ExtractionProgress'
import { ResultCard } from './components/ResultCard'
import { ThemeToggle } from './components/ThemeToggle'
import { MemoryView } from './components/memory/MemoryView'
import { AuthView } from './components/AuthView'
import { NewFolderModal } from './components/NewFolderModal'
import { SUPERGLUE_HOOKS } from '../config/superglue'
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

  const {
    user, theme, view, setView,
    platformState, selectedMode,
    extraction, dismissError,
    latestPack, packs,
    addPack, addCollection,
  } = useAppStore()

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [suggestedFolderName, setSuggestedFolderName] = useState<string | undefined>(undefined)

  function handleManualExtract() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) return
      chrome.runtime.sendMessage({ type: 'START_EXTRACTION', tabId, mode: selectedMode })
    })
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!user) return
    fetch(SUPERGLUE_HOOKS.getFolders, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        const folders = Array.isArray(data) ? data : (data?.folders ?? [])
        if (folders.length > 0) {
          const { setCollections } = useAppStore.getState()
          setCollections(folders)
        }
      })
      .catch(() => {})
  }, [user])

  async function handleSave(pack: Pack, folderId: string | null) {
    if (!user) { setView('auth'); return }

    const res = await fetch(SUPERGLUE_HOOKS.saveSummary, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        platform: pack.platform,
        title: pack.title,
        summary: pack.summary ?? '',
        key_points: pack.key_takeaways,
        video_url: pack.url,
        folder_id: folderId,
      }),
    })

    if (res.ok) {
      addPack(pack)
      setSavedIds((prev) => new Set(prev).add(pack.id))
    }
  }

  async function handleCreateFolder(name: string) {
    if (!user) { setView('auth'); return }

    const res = await fetch(SUPERGLUE_HOOKS.createFolder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '', color: '', user_id: user.id }),
    })

    if (res.ok) {
      const data = await res.json()
      const newCollection = data?.folder ?? data
      if (newCollection?.id) {
        addCollection(newCollection)
        setSelectedFolder(newCollection.id)
      }
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
          {packs.length > 0 && (
            <button className={styles.iconBtn} onClick={() => setView('library')} title="Library">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          )}
          {user ? (
            <button className={styles.iconBtn} onClick={() => supabase.auth.signOut()} title={`Signed in as ${user.email}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
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

        {/* Extract button — hidden while active */}
        {!isActive && (
          <button className={styles.extractBtn} onClick={handleManualExtract}>
            {hasContent ? 'Extract Again' : 'Extract'}
          </button>
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
            <button className={styles.extractBtn} onClick={handleManualExtract}>
              Stop &amp; Analyze
            </button>
          </div>
        )}

        {/* Result card — only shown when real content exists (summary / takeaways / points / links) */}
        {hasContent && latestPack && (
          <ResultCard
            pack={latestPack}
            onSave={handleSave}
            isSaved={savedIds.has(latestPack.id)}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            onCreateFolder={() => { setSuggestedFolderName(latestPack.title); setShowNewFolderModal(true) }}
            suggestedFolderName={suggestedFolderName}
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
            ) : extraction.upgradeRequired ? (
              <div className={styles.upgradePrompt}>
                <p className={styles.errorText}>{extraction.error}</p>
                <button className={styles.upgradeBtn} onClick={() => setView('auth')}>
                  {!user ? 'Sign in' : 'Upgrade to Pro'}
                </button>
              </div>
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
