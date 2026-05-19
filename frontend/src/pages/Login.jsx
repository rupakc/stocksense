import { useState } from 'react'
import { TrendingUp, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { login as loginApi } from '../services/api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const authLogin = useAuthStore((s) => s.login)

  const expired = new URLSearchParams(window.location.search).get('expired')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await loginApi(username, password)
      authLogin(data.access_token, data.username, data.is_admin ?? false, data.requires_password_change ?? false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
            <TrendingUp className="text-indigo-600 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">StockSense</h1>
          <p className="text-sm text-slate-500 mt-1">Global Market Intelligence</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Sign in</h2>
          <p className="text-xs text-slate-400 mb-6">Enter your credentials to access the dashboard</p>

          {expired && !error && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">Your session has expired. Please log in again.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-slate-600 mb-1.5">Username</label>
              <input
                id="username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                required autoComplete="username" autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          StockSense — ML-powered market analysis
        </p>
      </div>
    </div>
  )
}
