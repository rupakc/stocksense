import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useWatchlistStore = create(
  persist(
    (set) => ({
      symbols: [],
      selectedSymbol: null,

      setSymbols: (symbols) => set({ symbols }),
      addSymbol: (symbol) => set((s) => ({ symbols: [...new Set([...s.symbols, symbol])] })),
      removeSymbol: (symbol) => set((s) => ({ symbols: s.symbols.filter((x) => x !== symbol) })),
      selectSymbol: (symbol) => set({ selectedSymbol: symbol }),
    }),
    { name: 'watchlist' }
  )
)
