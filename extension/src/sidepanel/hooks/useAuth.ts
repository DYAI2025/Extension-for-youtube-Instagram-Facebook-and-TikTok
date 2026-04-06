import { useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAppStore } from '../store'

// These are safe to expose — they are public anon keys
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function useAuth() {
  const { setUser } = useAppStore()

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session
      if (session?.user) {
        syncUser(session.access_token, session.user.id, session.user.email ?? '')
      }
    })

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        syncUser(session.access_token, session.user.id, session.user.email ?? '')
      } else {
        setUser(null)
        chrome.storage.local.remove('supabase_token')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [setUser])
}

async function syncUser(token: string, id: string, email: string) {
  // Persist token for background service worker to use
  chrome.storage.local.set({ supabase_token: token })

  // Fetch plan from profiles table
  const { data } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', id)
    .single()

  useAppStore.getState().setUser({
    id,
    email,
    plan: data?.plan ?? 'free',
  })
}
