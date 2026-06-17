'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'mash-sidebar-collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setCollapsedState(true)
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  return { collapsed, setCollapsed, toggle, hydrated }
}
