import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getProfile, changePassword } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { User, Lock, LogOut, CheckCircle, AlertCircle } from 'lucide-react'
import { useToast } from '../components/Toast'

function validatePassword(password) {
  const errors = []
  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one digit')
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) errors.push('At least one special character')
  return errors
}

function ProfileCard() {
  const { data: profile, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const logout = useAuthStore(s => s.logout)

  if (isLoading) return <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
          <User className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{profile?.username}</p>
          <p className="text-xs text-slate-400">
            Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'}
          </p>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-slate-100">
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  )
}

function ChangePasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword(current, newPwd),
    onSuccess: () => {
      setCurrent('')
      setNewPwd('')
      setConfirm('')
      toast('Password updated successfully', 'success')
    },
    onError: () => toast('Password change failed. Please check your inputs and try again.', 'error'),
  })

  const pwErrors = newPwd ? validatePassword(newPwd) : []
  const canSubmit = current && newPwd && newPwd === confirm && pwErrors.length === 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-slate-500" />
        <p className="text-sm font-semibold text-slate-800">Change Password</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-600">Current Password</label>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
            className="w-full mt-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">New Password</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
            className="w-full mt-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {newPwd && (
            <ul className="mt-2 space-y-0.5">
              {[
                { label: 'At least 8 characters', met: newPwd.length >= 8 },
                { label: 'At least one uppercase letter', met: /[A-Z]/.test(newPwd) },
                { label: 'At least one digit', met: /[0-9]/.test(newPwd) },
                { label: 'At least one special character', met: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(newPwd) },
              ].map(({ label, met }) => (
                <li key={label} className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {met ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Confirm New Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full mt-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {confirm && confirm !== newPwd && (
            <p className="text-[10px] text-rose-500 mt-1">Passwords don&apos;t match</p>
          )}
        </div>
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={!canSubmit || mutation.isPending}
        className="w-full text-sm font-semibold bg-indigo-600 text-white py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {mutation.isPending ? 'Updating...' : 'Update Password'}
      </button>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account and preferences</p>
      </div>
      <ProfileCard />
      <ChangePasswordCard />
    </div>
  )
}
