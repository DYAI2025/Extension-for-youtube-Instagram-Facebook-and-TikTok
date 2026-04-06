import { useEffect } from 'react'
import { supabase } from './useAuth'
import { useAppStore } from '../store'
import type { Pack, Collection } from '@shared/types'

export function useLibrary() {
  const { user, setPacks, setCollections } = useAppStore()

  useEffect(() => {
    if (!user) return

    async function load() {
      const [{ data: packs }, { data: collections }] = await Promise.all([
        supabase
          .from('packs')
          .select('*')
          .eq('user_id', user!.id)
          .order('saved_at', { ascending: false })
          .limit(50),
        supabase
          .from('collections')
          .select('*, collection_items(*)')
          .eq('user_id', user!.id),
      ])

      if (packs) setPacks(packs as Pack[])
      if (collections) setCollections(collections as Collection[])
    }

    load()
  }, [user, setPacks, setCollections])
}
