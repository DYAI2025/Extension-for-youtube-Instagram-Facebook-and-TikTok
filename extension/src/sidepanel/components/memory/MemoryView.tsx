import { useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import { loadLibrary } from '../../hooks/useLibrary'
import { exportPackToPdf } from '../../utils/pdfExport'
import type { Pack, SavedItem } from '@shared/types'
import styles from './MemoryView.module.css'

type Tab = 'recent' | 'items' | 'collections'

export function MemoryView() {
  const { packs, collections, savedItems, user, libraryLoading, libraryError } = useAppStore()
  const [tab, setTab] = useState<Tab>('recent')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)

  // Recent: filter by selected folder if any. Pack ids contained in the
  // selected collection's items[] form the allowed set.
  const filteredPacks = useMemo<Pack[]>(() => {
    if (!folderFilter) return packs
    const col = collections.find((c) => c.id === folderFilter)
    if (!col) return packs
    const allowed = new Set(col.items.filter((i) => i.type === 'pack').map((i) => i.refId))
    return packs.filter((p) => allowed.has(p.id))
  }, [packs, collections, folderFilter])

  if (!user) {
    return (
      <div className={styles.root}>
        <p className={styles.empty}>Sign in to see your library.</p>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {user.email && (
        <p className={styles.identity}>Signed in as {user.email}</p>
      )}

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'recent' ? styles.active : ''}`} onClick={() => setTab('recent')}>
          Recent
        </button>
        <button className={`${styles.tab} ${tab === 'items' ? styles.active : ''}`} onClick={() => setTab('items')}>
          Items
        </button>
        <button className={`${styles.tab} ${tab === 'collections' ? styles.active : ''}`} onClick={() => setTab('collections')}>
          Folders
        </button>
      </div>

      <div className={styles.utilityRow}>
        <button
          className={styles.reloadBtn}
          onClick={() => { void loadLibrary() }}
          disabled={libraryLoading}
        >
          {libraryLoading ? 'Loading…' : 'Reload'}
        </button>
        {libraryError && (
          <span className={styles.errorText} title={libraryError}>
            Could not load library — {libraryError}
          </span>
        )}
      </div>

      {tab === 'recent' && (
        <>
          {collections.length > 0 && (
            <div className={styles.filterRow}>
              <button
                className={`${styles.filterChip} ${folderFilter === null ? styles.filterChipActive : ''}`}
                onClick={() => setFolderFilter(null)}
              >
                All
              </button>
              {collections.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.filterChip} ${folderFilter === c.id ? styles.filterChipActive : ''}`}
                  onClick={() => setFolderFilter(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className={styles.list}>
            {filteredPacks.length === 0 ? (
              <p className={styles.empty}>
                {folderFilter ? 'No analyses in this folder.' : 'No saved analyses yet.'}
              </p>
            ) : (
              filteredPacks.map((pack) => <PackRow key={pack.id} pack={pack} />)
            )}
          </div>
        </>
      )}

      {tab === 'items' && (
        <div className={styles.list}>
          {savedItems.length === 0 ? (
            <p className={styles.empty}>No saved items yet. Use the checkboxes on an analysis to save the bits you care about.</p>
          ) : (
            savedItems.map((item) => <SavedItemRow key={item.id} item={item} />)
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div className={styles.list}>
          {collections.length === 0 ? (
            <p className={styles.empty}>No folders yet. Create one when saving an analysis.</p>
          ) : (
            collections.map((col) => (
              <div
                key={col.id}
                className={styles.collection}
                onClick={() => { setFolderFilter(col.id); setTab('recent') }}
                role="button"
                tabIndex={0}
              >
                <p className={styles.collectionName}>{col.name}</p>
                <span className={styles.collectionCount}>{col.items.length}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function PackRow({ pack }: { pack: Pack }) {
  return (
    <div className={styles.packRow}>
      <div className={styles.packMeta}>
        <span className={styles.packPlatform}>{pack.platform}</span>
        <span className={styles.packMode}>{pack.mode}</span>
      </div>
      <p className={styles.packTitle}>{pack.title}</p>
      <p className={styles.packPreview}>{pack.summary ?? pack.key_takeaways[0] ?? ''}</p>
      <button
        type="button"
        className={styles.exportBtn}
        onClick={(e) => { e.stopPropagation(); exportPackToPdf(pack) }}
      >
        Export PDF
      </button>
    </div>
  )
}

function SavedItemRow({ item }: { item: SavedItem }) {
  const p = item.payload
  return (
    <div className={styles.itemRow}>
      <div className={styles.itemMeta}>
        <span className={styles.itemType}>{item.itemType.replace('_', ' ')}</span>
        {p.context && <span className={styles.itemContext}>{p.context}</span>}
      </div>
      <p className={styles.itemTitle}>{p.title || item.videoTitle || 'Untitled'}</p>
      {p.content && <p className={styles.itemContent}>{p.content}</p>}
      {p.resource_url && (
        <a className={styles.itemUrl} href={p.resource_url} target="_blank" rel="noreferrer">
          {p.resource_url}
        </a>
      )}
    </div>
  )
}
