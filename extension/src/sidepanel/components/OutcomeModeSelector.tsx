import type { OutcomeMode } from '@shared/types'
import styles from './OutcomeModeSelector.module.css'

const MODES: { value: OutcomeMode; label: string; description: string }[] = [
  { value: 'knowledge',      label: 'Knowledge',  description: 'Key concepts & mental models' },
  { value: 'build-pack',    label: 'Build Pack',  description: 'Steps, code, repos, tools' },
  { value: 'decision-pack', label: 'Decision',    description: 'Criteria, tradeoffs, rules' },
  { value: 'coach-notes',   label: 'Coach',       description: 'Drills, cues, corrections' },
  { value: 'tools',         label: 'Tools',       description: 'Apps, services, links' },
  { value: 'stack',         label: 'Stack',       description: 'Tech stack breakdown' },
]

interface Props {
  selected: OutcomeMode
  onChange: (mode: OutcomeMode) => void
}

export function OutcomeModeSelector({ selected, onChange }: Props) {
  return (
    <div className={styles.root}>
      {MODES.map((m) => (
        <button
          key={m.value}
          className={`${styles.chip} ${selected === m.value ? styles.active : ''}`}
          onClick={() => onChange(m.value)}
          title={m.description}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
