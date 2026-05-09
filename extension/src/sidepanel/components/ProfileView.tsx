import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { updateProfile, loadProfile } from '../hooks/useProfile'
import { supabase } from '../hooks/useAuth'
import { useT } from '../i18n'
import { PackDetailView } from './memory/PackDetailView'
import type { OutcomeMode } from '@shared/types'
import styles from './ProfileView.module.css'

const MODE_LABELS: Record<OutcomeMode, string> = {
  'knowledge':     'Knowledge',
  'build-pack':    'Build Pack',
  'decision-pack': 'Decision Pack',
  'coach-notes':   'Coach Notes',
  'tools':         'Tools',
  'stack':         'Tech Stack',
}

const LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
]

export function ProfileView() {
  const profile = useAppStore((s) => s.profile)
  const user = useAppStore((s) => s.user)
  const profileLoading = useAppStore((s) => s.profileLoading)
  const profileError = useAppStore((s) => s.profileError)
  const setView = useAppStore((s) => s.setView)
  const packs = useAppStore((s) => s.packs)
  const collections = useAppStore((s) => s.collections)
  const savedItems = useAppStore((s) => s.savedItems)
  const setLibraryFolderFilter = useAppStore((s) => s.setLibraryFolderFilter)
  const t = useT()

  function openFolderInLibrary(folderId: string | null) {
    console.log('[PROFILE-DEBUG] folder chip click | folderId-suffix:', folderId ? folderId.slice(0, 8) : 'none')
    setLibraryFolderFilter(folderId)
    setView('library')
  }

  const [displayName, setDisplayName] = useState('')
  const [language, setLanguage] = useState('en')
  const [defaultMode, setDefaultMode] = useState<OutcomeMode>('knowledge')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openPackId, setOpenPackId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setLanguage(profile.preferred_language ?? 'en')
    setDefaultMode(profile.default_mode ?? 'knowledge')
  }, [profile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setStatus(null)
    const updated = await updateProfile({
      display_name: displayName.trim() || null,
      preferred_language: language,
      default_mode: defaultMode,
    })
    setSaving(false)
    if (updated) {
      setStatus({ kind: 'ok', msg: t('saved') })
    } else {
      setStatus({ kind: 'err', msg: t('couldNotLoadProfile') })
    }
  }

  if (!user) {
    return (
      <div className={styles.root}>
        <p className={styles.empty}>{t('pleaseSignIn')}</p>
      </div>
    )
  }

  if (!profile) {
    if (profileError) {
      return (
        <div className={styles.root}>
          <p className={styles.error}>{t('couldNotLoadProfile')}: {profileError}</p>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => { void loadProfile() }}
          >
            {t('retry')}
          </button>
          <div className={styles.signOutRow}>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={() => supabase.auth.signOut()}
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className={styles.root}>
        <p className={styles.empty}>{profileLoading ? t('loadingProfile') : t('noProfile')}</p>
      </div>
    )
  }

  const openPack = openPackId ? packs.find((p) => p.id === openPackId) ?? null : null
  if (openPack) {
    return (
      <div className={styles.root}>
        <button className={styles.backInline} onClick={() => setOpenPackId(null)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {t('back')}
        </button>
        <PackDetailView pack={openPack} onBack={() => setOpenPackId(null)} />
      </div>
    )
  }

  const isPro = profile.plan === 'pro'
  const recentPacks = packs.slice(0, 3)
  const recentItems = savedItems.slice(0, 3)
  const recentFolders = collections.slice(0, 5)

  return (
    <div className={styles.root}>
      {/* Account card */}
      <div className={styles.identity}>
        <span className={styles.email}>{user.email || t('youAreSignedIn')}</span>
        <div className={styles.planRow}>
          <span className={`${styles.planBadge} ${isPro ? styles.planPro : styles.planFree}`}>
            {isPro ? t('proPlan') : t('freePlan')}
          </span>
          <span>{t('plan')}</span>
        </div>
      </div>

      {/* Settings (collapsible) */}
      <div className={styles.settingsBlock}>
        <button
          type="button"
          className={styles.collapsibleHeader}
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          <span>{t('settings')}</span>
          <svg
            className={`${styles.chevron} ${settingsOpen ? styles.chevronOpen : ''}`}
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {settingsOpen && (
          <form className={styles.settingsForm} onSubmit={handleSave}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="display_name">{t('displayName')}</label>
              <input
                id="display_name"
                className={styles.input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="language">{t('preferredLanguage')}</label>
              <select
                id="language"
                className={styles.select}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="default_mode">{t('defaultMode')}</label>
              <select
                id="default_mode"
                className={styles.select}
                value={defaultMode}
                onChange={(e) => setDefaultMode(e.target.value as OutcomeMode)}
              >
                {(Object.keys(MODE_LABELS) as OutcomeMode[]).map((m) => (
                  <option key={m} value={m}>{MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>

            {status?.kind === 'ok' && <p className={styles.status}>{status.msg}</p>}
            {status?.kind === 'err' && <p className={styles.error}>{status.msg}</p>}

            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </form>
        )}
      </div>

      {/* Folders */}
      <div className={styles.dashboardBlock}>
        <div className={styles.dashboardHeader}>
          <span>{t('folders')}</span>
          <button type="button" className={styles.viewAll} onClick={() => openFolderInLibrary(null)}>
            {t('open')} →
          </button>
        </div>
        {recentFolders.length === 0 ? (
          <p className={styles.dashboardEmpty}>{t('noFolders')}</p>
        ) : (
          <div className={styles.folderList}>
            {recentFolders.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.folderChip}
                onClick={() => openFolderInLibrary(c.id)}
                title={`${t('open')}: ${c.name}`}
              >
                {c.name}
                <span className={styles.folderCount}>{c.items.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Saved analyses */}
      <div className={styles.dashboardBlock}>
        <div className={styles.dashboardHeader}>
          <span>{t('savedAnalyses')}</span>
          <button type="button" className={styles.viewAll} onClick={() => openFolderInLibrary(null)}>
            {t('open')} →
          </button>
        </div>
        {recentPacks.length === 0 ? (
          <p className={styles.dashboardEmpty}>{t('noAnalyses')}</p>
        ) : (
          <div className={styles.miniList}>
            {recentPacks.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.miniRow}
                onClick={() => setOpenPackId(p.id)}
              >
                <p className={styles.miniTitle}>{p.title}</p>
                <p className={styles.miniMeta}>{p.platform} · {p.mode}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Saved items */}
      <div className={styles.dashboardBlock}>
        <div className={styles.dashboardHeader}>
          <span>{t('savedItems')}</span>
          <button type="button" className={styles.viewAll} onClick={() => openFolderInLibrary(null)}>
            {t('open')} →
          </button>
        </div>
        {recentItems.length === 0 ? (
          <p className={styles.dashboardEmpty}>{t('noItems')}</p>
        ) : (
          <div className={styles.miniList}>
            {recentItems.map((it) => (
              <div key={it.id} className={styles.miniRow}>
                <p className={styles.miniTitle}>{it.payload.title || it.videoTitle || 'Untitled'}</p>
                <p className={styles.miniMeta}>{it.itemType.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.signOutRow}>
        <button
          type="button"
          className={styles.signOutBtn}
          onClick={() => supabase.auth.signOut()}
        >
          {t('signOut')}
        </button>
      </div>
    </div>
  )
}
