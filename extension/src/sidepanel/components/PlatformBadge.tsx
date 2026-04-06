import type { Platform, ExtractionStrategy } from '@shared/types'
import styles from './PlatformBadge.module.css'

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  unknown: '—',
}

interface Props {
  platform: Platform
  strategy: ExtractionStrategy
  title: string
}

export function PlatformBadge({ platform, strategy, title }: Props) {
  if (platform === 'unknown') {
    return (
      <div className={styles.idle}>
        <span className={styles.hint}>Open a video to get started</span>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={`${styles.dot} ${styles[platform]}`} />
        <span className={styles.platform}>{PLATFORM_LABELS[platform]}</span>
        <span className={styles.strategy}>{strategy === 'instant' ? 'Instant' : 'Live'}</span>
      </div>
      {title && <p className={styles.title}>{title}</p>}
    </div>
  )
}
