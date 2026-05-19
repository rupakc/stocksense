import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      username: null,
      is_admin: false,
      requiresPasswordChange: false,

      login: (token, username, is_admin = false, requiresPasswordChange = false) =>
        set({ token, username, is_admin, requiresPasswordChange }),
      clearPasswordChangeRequired: () => set({ requiresPasswordChange: false }),
      logout: () => set({ token: null, username: null, is_admin: false, requiresPasswordChange: false }),
    }),
    { name: 'stocksense-auth' }
  )
)
