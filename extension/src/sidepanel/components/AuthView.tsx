import { useState } from 'react'
import { supabase } from '../hooks/useAuth'
import styles from './AuthView.module.css'

export function AuthView() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account.')
    }

    setLoading(false)
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.heading}>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          required
        />

        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}

        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        className={styles.toggle}
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
      >
        {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  )
}
