import { useState } from 'react'
import { TrendingUp, KeyRound, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { changePassword } from '../services/api'

const RULES = [
  { label: 'At least 8 characters',        test: (p) => p.length >= 8 },
  { label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'At least one digit',            test: (p) => /[0-9]/.test(p) },
  { label: 'At least one special character',test: (p) => /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(p) },
]

export default function ForceChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const clearPasswordChangeRequired = useAuthStore((s) => s.clearPasswordChangeRequired)
  const logout = useAuthStore((s) => s.logout)

  const rulesMet = RULES.every((r) => r.test(newPassword))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (!rulesMet) {
      setError('New password does not meet the requirements below')
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      clearPasswordChangeRequired()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
            <KeyRound className="text-amber-600 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Change Password</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">Your account requires a password change before you can continue</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Your password was set by an administrator. Please set a new personal password to continue.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Current password <span className="text-slate-400 font-normal">(set by admin)</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required autoComplete="current-password" autoFocus
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter your current password"
                />
                <button type="button" onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Choose a strong password"
                />
                <button type="button" onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && (
                <ul className="mt-2 space-y-0.5">
                  {RULES.map(({ label, test }) => {
                    const met = test(newPassword)
                    return (
                      <li key={label} className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {met ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {label}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Repeat your new password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Sign out and log in as a different user
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
