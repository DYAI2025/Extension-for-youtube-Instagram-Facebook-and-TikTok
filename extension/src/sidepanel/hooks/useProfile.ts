import { useEffect } from 'react'
import { supabase } from './useAuth'
import { useAppStore } from '../store'
import type { UserProfile } from '@shared/types'

// `profiles.email` does not exist in the deployed schema — email is sourced
// from `auth.users` via the active session. Selecting it would break every
// profile load with a 42703 column-not-found error.
const PROFILE_COLUMNS =
  'id, display_name, preferred_language, default_mode, plan, created_at, updated_at'

/**
 * Loads the user's profile row, creating one defensively if the
 * `handle_new_user` trigger never ran (e.g. user was provisioned before
 * migration 003, or an OAuth signup raced the trigger).
 *
 * Logs are tagged `[PROFILE-DEBUG]` and contain only status text — never
 * tokens, codes, or any other secret material.
 */
export async function loadProfile(): Promise<void> {
  const state = useAppStore.getState()
  const user = state.user
  if (!user) {
    state.setProfile(null)
    state.setProfileError(null)
    state.setProfileLoading(false)
    return
  }

  state.setProfileLoading(true)
  state.setProfileError(null)
  console.log('[PROFILE-DEBUG] load: start | userId-suffix:', user.id.slice(0, 8))

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.warn('[PROFILE-DEBUG] load: select failed |', error.message)
      useAppStore.getState().setProfileError(error.message)
      return
    }

    if (data) {
      console.log('[PROFILE-DEBUG] load: row found |', { plan: (data as UserProfile).plan })
      const profile = data as UserProfile
      useAppStore.getState().setProfile(profile)
      // Sync UI language from profile if it's a supported value.
      const pref = profile.preferred_language
      if (pref === 'en' || pref === 'de') {
        useAppStore.getState().setLanguage(pref)
      }
      return
    }

    // No row → create one. Defaults match migration 003 column defaults
    // except for display_name (use email prefix) and preferred_language
    // (default to 'de' per product preference).
    const emailPrefix = (user.email ?? '').split('@')[0] || null
    console.log('[PROFILE-DEBUG] load: no row → auto-creating')
    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        display_name: emailPrefix,
        preferred_language: 'de',
        default_mode: 'knowledge',
        plan: 'free',
      })
      .select(PROFILE_COLUMNS)
      .single()

    if (insertError) {
      console.warn('[PROFILE-DEBUG] auto-create: insert failed |', insertError.message)
      // Some setups race the handle_new_user trigger; on a unique-violation
      // (23505) re-select once and use whatever the trigger inserted.
      if (insertError.code === '23505') {
        const { data: refetched, error: refetchError } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('id', user.id)
          .maybeSingle()
        if (!refetchError && refetched) {
          console.log('[PROFILE-DEBUG] auto-create: row materialized via trigger')
          useAppStore.getState().setProfile(refetched as UserProfile)
          return
        }
      }
      useAppStore.getState().setProfileError(insertError.message)
      return
    }

    if (created) {
      console.log('[PROFILE-DEBUG] auto-create: success')
      useAppStore.getState().setProfile(created as UserProfile)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.warn('[PROFILE-DEBUG] load: unexpected error |', msg)
    useAppStore.getState().setProfileError(msg)
  } finally {
    useAppStore.getState().setProfileLoading(false)
  }
}

export function useProfile() {
  const user = useAppStore((s) => s.user)

  useEffect(() => {
    if (!user) {
      const s = useAppStore.getState()
      s.setProfile(null)
      s.setProfileError(null)
      s.setProfileLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      await loadProfile()
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [user])
}

export async function updateProfile(patch: Partial<Pick<UserProfile, 'display_name' | 'preferred_language' | 'default_mode'>>): Promise<UserProfile | null> {
  const user = useAppStore.getState().user
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) {
    console.warn('[PROFILE-DEBUG] update failed |', error.message)
    return null
  }
  const profile = data as UserProfile
  useAppStore.getState().setProfile(profile)
  if (profile.preferred_language === 'en' || profile.preferred_language === 'de') {
    useAppStore.getState().setLanguage(profile.preferred_language)
  }
  return profile
}
