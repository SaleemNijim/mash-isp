'use client'

import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

let activeUserId: string | null = null
let activeUnsubscribe: (() => void) | null = null

interface PermissionsState {
  /** Flat list of permission codes held by the current user */
  permissions: string[]
  /** Current user role — admin/super_admin bypass all permission checks */
  role: string | null
  /** True while the initial fetch is in flight */
  loading: boolean
  /** Returns true if the user holds the given permission code */
  hasPermission: (code: string) => boolean
  /** Fetches user_permissions from DB and overwrites the store */
  loadPermissions: () => Promise<void>
  /**
   * Opens a Realtime channel scoped to userId.
   * Whenever user_permissions changes (INSERT/UPDATE/DELETE) the store
   * refreshes immediately — no re-login required (§1.1 B2 + §8.3 O6).
   * Returns an unsubscribe function.
   */
  subscribe: (userId: string) => () => void
}

export const usePermissions = create<PermissionsState>((set, get) => ({
  permissions: [],
  role: null,
  loading: false,

  hasPermission: (code: string) => {
    const { role, permissions } = get()
    if (role === 'admin' || role === 'super_admin') return true
    return permissions.includes(code)
  },

  loadPermissions: async () => {
    set({ loading: true })
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      set({ permissions: [], role: null, loading: false })
      return
    }

    const [{ data: profile }, { data: perms }] = await Promise.all([
      supabase.from('users').select('role').eq('id', user.id).single(),
      supabase.from('user_permissions').select('permission').eq('user_id', user.id),
    ])

    set({
      role: (profile?.role as string) ?? null,
      permissions: perms?.map((r) => r.permission as string) ?? [],
      loading: false,
    })
  },

  subscribe: (userId: string) => {
    if (activeUserId === userId && activeUnsubscribe) {
      return activeUnsubscribe
    }

    if (activeUnsubscribe) {
      activeUnsubscribe()
      activeUnsubscribe = null
      activeUserId = null
    }

    const supabase = createClient()
    const channelName = `user-permissions-${userId}`

    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${channelName}`)
    if (existing) {
      supabase.removeChannel(existing)
    }

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_permissions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh full list on any change
          get().loadPermissions()
        }
      )
      .subscribe()

    const unsubscribe = () => {
      supabase.removeChannel(channel)
      if (activeUserId === userId) {
        activeUserId = null
        activeUnsubscribe = null
      }
    }

    activeUserId = userId
    activeUnsubscribe = unsubscribe
    return unsubscribe
  },
}))
