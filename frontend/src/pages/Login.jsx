import { useState } from 'react'
import { TrendingUp, LogIn, UserPlus, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { login as loginApi, register as registerApi } from '../services/api'

function validatePassword(password) {
  const errors = []
  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one digit')
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) errors.push('At least one special character')
  return errors
}

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const authLogin = useAuthStore((s) => s.login)

  const expired = new URLSearchParams(window.location.search).get('expired')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (isRegister) {
      const pwErrors = validatePassword(password)
      if (pwErrors.length > 0) {
        setError('Password does not meet requirements')
        return
      }
    }

    setLoading(true)
    try {
      const data = isRegister
        ? await registerApi(username, password)
        : await loginApi(username, password)
      authLogin(data.access_token, data.username)
    } catch (err) {
      setError(err.response?.data?.detail || (isRegister ? 'Registration failed' : 'Login failed. Please try again.'))
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
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            {isRegister ? 'Create Account' : 'Sign in'}
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            {isRegister ? 'Set up your account to get started' : 'Enter your credentials to access the dashboard'}
          </p>

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
                minLength={3}
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
                  required autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : undefined}
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
              {isRegister && password && (
                <ul className="mt-2 space-y-0.5">
                  {[
                    { label: 'At least 8 characters', met: password.length >= 8 },
                    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
                    { label: 'At least one digit', met: /[0-9]/.test(password) },
                    { label: 'At least one special character', met: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password) },
                  ].map(({ label, met }) => (
                    <li key={label} className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {met ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isRegister && (
              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm Password</label>
                <input
                  id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required autoComplete="new-password"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Confirm your password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password || (isRegister && !confirmPassword)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isRegister ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? (isRegister ? 'Creating account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign in')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setIsRegister(v => !v); setError(null) }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          StockSense — ML-powered market analysis
        </p>
      </div>
    </div>
  )
}
