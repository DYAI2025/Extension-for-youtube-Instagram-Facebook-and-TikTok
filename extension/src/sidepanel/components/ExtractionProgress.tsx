import styles from './ExtractionProgress.module.css'

interface Props {
  percent: number
  statusText: string
}

export function ExtractionProgress({ percent, statusText }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      {statusText && <p className={styles.text}>{statusText}</p>}
    </div>
  )
}
