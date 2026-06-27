'use client'

import Image from 'next/image'

interface TenantBrandProps {
  name: string
  logoUrl?: string | null
  collapsed?: boolean
  subtitle?: string
}

export function TenantBrand({
  name,
  logoUrl,
  collapsed,
  subtitle,
}: TenantBrandProps) {
  const avatar = (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
        logoUrl ? '' : 'bg-[#E8F5F1] text-[#0F6E56] font-bold'
      }`}
      title={collapsed ? name : undefined}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          width={28}
          height={28}
          className="h-full w-full object-contain"
          unoptimized
        />
      ) : (
        <span className="text-xs font-medium w-full h-full flex items-center justify-center">
          {name.charAt(0) || 'M'}
        </span>
      )}
    </div>
  )

  if (collapsed) return avatar

  return (
    <div className="flex items-center gap-2 min-w-0">
      {avatar}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[#0D1F1A]">{name}</p>
        {subtitle && (
          <p className="truncate text-[10px] text-[#4A6B60]">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
