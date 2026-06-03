import { create } from 'zustand'
import type { AnalyticsFilter, DatePreset } from '@shared/types/index'

function rangeFor(preset: DatePreset): { dateFrom: number | null; dateTo: number | null } {
  const now = new Date()
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  switch (preset) {
    case 'today':
      return { dateFrom: end - 86_400_000, dateTo: end }
    case '7d':
      return { dateFrom: end - 7 * 86_400_000, dateTo: end }
    case '30d':
      return { dateFrom: end - 30 * 86_400_000, dateTo: end }
    case 'this_month':
      return {
        dateFrom: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        dateTo: end,
      }
    case 'last_month': {
      const firstThis = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      const firstLast = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      return { dateFrom: firstLast, dateTo: firstThis }
    }
    case 'all':
    case 'custom':
    default:
      return { dateFrom: null, dateTo: null }
  }
}

export const DEFAULT_FILTER: AnalyticsFilter = {
  accountIds: 'all',
  ...rangeFor('30d'),
  datePreset: '30d',
  mode: 'all',
  pairIds: [],
  setupIds: [],
  killzoneIds: [],
  cleanOnly: false,
}

interface AnalyticsStore {
  filter: AnalyticsFilter
  setFilter: (partial: Partial<AnalyticsFilter>) => void
  setDatePreset: (preset: DatePreset) => void
  reset: () => void
}

export const useAnalyticsStore = create<AnalyticsStore>()((set) => ({
  filter: DEFAULT_FILTER,
  setFilter: (partial) => set((s) => ({ filter: { ...s.filter, ...partial } })),
  setDatePreset: (preset) =>
    set((s) => {
      if (preset === 'custom') return { filter: { ...s.filter, datePreset: 'custom' } }
      const { dateFrom, dateTo } = rangeFor(preset)
      return { filter: { ...s.filter, datePreset: preset, dateFrom, dateTo } }
    }),
  reset: () => set({ filter: DEFAULT_FILTER }),
}))
