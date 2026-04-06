import type { Pack } from '@shared/types'
import styles from './ResultCard.module.css'

interface Props {
  pack: Pack
  onSave: (pack: Pack) => void
  isSaved: boolean
}

export function ResultCard({ pack, onSave, isSaved }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>{pack.title}</p>
          <p className={styles.meta}>{pack.mode} · {pack.platform}</p>
        </div>
        <button
          className={`${styles.saveBtn} ${isSaved ? styles.saved : ''}`}
          onClick={() => onSave(pack)}
          disabled={isSaved}
        >
          {isSaved ? 'Saved' : 'Save'}
        </button>
      </div>

      <ul className={styles.bullets}>
        {pack.bullets.map((b, i) => (
          <li key={i} className={styles.bullet}>{b}</li>
        ))}
      </ul>
    </div>
  )
}
