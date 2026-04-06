import { useState } from 'react'
import { useAppStore } from '../../store'
import type { Pack } from '@shared/types'
import styles from './MemoryView.module.css'

export function MemoryView() {
  const { packs, collections } = useAppStore()
  const [tab, setTab] = useState<'recent' | 'collections'>('recent')

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'recent' ? styles.active : ''}`}
          onClick={() => setTab('recent')}
        >
          Recent
        </button>
        <button
          className={`${styles.tab} ${tab === 'collections' ? styles.active : ''}`}
          onClick={() => setTab('collections')}
        >
          Collections
        </button>
      </div>

      {tab === 'recent' && (
        <div className={styles.list}>
          {packs.length === 0 ? (
            <p className={styles.empty}>No saved packs yet.</p>
          ) : (
            packs.map((pack) => <PackRow key={pack.id} pack={pack} />)
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div className={styles.list}>
          {collections.length === 0 ? (
            <p className={styles.empty}>No collections yet.</p>
          ) : (
            collections.map((col) => (
              <div key={col.id} className={styles.collection}>
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
      <p className={styles.packPreview}>{pack.bullets[0]}</p>
    </div>
  )
}
