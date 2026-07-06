import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 min-w-0">
      <div className="min-w-0 flex-1">
        <h1 className="mash-page-title break-words text-xl sm:text-2xl">{title}</h1>
        {description && (
          <p className="mash-page-description break-words">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
