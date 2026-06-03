import { motion } from 'framer-motion'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { springDefault } from '../../lib/motion'

export interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  tabs: TabItem[]
  activeId?: string
  onChange?: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? '')
  const active = activeId ?? internalActive

  function handleChange(id: string) {
    setInternalActive(id)
    onChange?.(id)
  }

  return (
    <div className={cn('flex border-b border-border', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleChange(tab.id)}
            className={cn(
              'relative px-3 pb-2.5 pt-1 text-body font-medium transition-colors',
              isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-accent-a"
                transition={springDefault}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
