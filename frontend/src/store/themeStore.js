import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => {
        const next = !s.dark
        document.documentElement.classList.toggle('dark', next)
        return { dark: next }
      }),
      init: () => set((s) => {
        document.documentElement.classList.toggle('dark', s.dark)
        return s
      }),
    }),
    { name: 'stocksense-theme' }
  )
)
