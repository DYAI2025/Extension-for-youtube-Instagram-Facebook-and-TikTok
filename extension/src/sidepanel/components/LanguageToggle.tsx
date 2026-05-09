import { useAppStore } from '../store'
import { LANGUAGES } from '../i18n'
import { updateProfile } from '../hooks/useProfile'
import styles from './LanguageToggle.module.css'

/**
 * Two-segment DE/EN toggle for the top bar. Switching writes to the store
 * (which persists to localStorage) and, when the user is signed in, mirrors
 * the change into `profiles.preferred_language` so the choice follows them
 * across devices.
 */
export function LanguageToggle() {
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const user = useAppStore((s) => s.user)

  function handleSwitch(next: 'en' | 'de') {
    if (next === language) return
    setLanguage(next)
    if (user) {
      void updateProfile({ preferred_language: next })
    }
  }

  return (
    <div className={styles.root} role="group" aria-label="Language">
      {LANGUAGES.map((opt) => (
        <button
          key={opt.code}
          type="button"
          className={`${styles.btn} ${opt.code === language ? styles.btnActive : ''}`}
          onClick={() => handleSwitch(opt.code)}
          aria-pressed={opt.code === language}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
