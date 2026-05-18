import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPreferences, updatePreferences, getExchanges } from '../services/api'

export const useExchangeStore = create(
  persist(
    (set, get) => ({
      selected: 'ALL',
      exchanges: [],

      setSelected: async (id) => {
        set({ selected: id })
        try { await updatePreferences({ preferred_exchange: id }) } catch { /* ignore */ }
      },

      loadExchanges: async () => {
        try {
          const data = await getExchanges()
          set({ exchanges: data })
        } catch { /* ignore */ }
      },

      syncFromServer: async () => {
        try {
          const prefs = await getPreferences()
          if (prefs?.preferred_exchange) {
            set({ selected: prefs.preferred_exchange })
          }
        } catch { /* ignore */ }
      },

      exchangeForSymbol: (symbol) => {
        if (symbol?.endsWith('.NS')) return 'NSE'
        if (symbol?.endsWith('.BO')) return 'BSE'
        return 'NASDAQ'
      },

      matchesSelected: (symbol) => {
        const sel = get().selected
        if (sel === 'ALL') return true
        return get().exchangeForSymbol(symbol) === sel
      },
    }),
    { name: 'stocksense-exchange' }
  )
)
