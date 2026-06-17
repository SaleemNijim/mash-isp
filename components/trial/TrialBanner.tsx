'use client'

import { useState } from 'react'
import { useTenant } from '@/hooks/useTenant'
import { UpgradeModal } from './UpgradeModal'

const LEVEL_STYLES = {
  info: 'bg-mash-info-bg text-mash-info-text border-mash-border',
  warning: 'bg-mash-warning-bg text-mash-warning-text border-mash-border',
  danger: 'bg-mash-danger-bg text-mash-danger-text border-mash-border',
} as const

export function TrialBanner() {
  const { data: tenant } = useTenant()
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (!tenant?.is_trial) return null

  const daysLeft = Math.ceil(
    (new Date(tenant.trial_ends_at!).getTime() - Date.now()) / 86400000
  )
  if (daysLeft <= 0) return null

  const level = daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warning' : 'info'

  return (
    <>
      <div
        className={`w-full py-2 px-4 text-center text-sm border-b ${LEVEL_STYLES[level]}`}
        dir="rtl"
      >
        فترة التجربة المجانية: {daysLeft} يوم متبق{daysLeft === 1 ? '' : 'ي'} —
        <button
          onClick={() => setShowUpgrade(true)}
          className="underline font-medium mr-1 text-primary-800"
        >
          اشترك الآن
        </button>
      </div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  )
}
