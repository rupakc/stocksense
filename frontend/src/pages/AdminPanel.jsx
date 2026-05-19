import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Shield, ShieldOff, KeyRound, UserCheck, UserX, X, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'

function authHeaders() {
  const token = useAuthStore.getState().token
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

function validatePassword(password) {
  const errors = []
  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one digit')
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) errors.push('At least one special character')
  return errors
}

function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-slate-100 text-slate-600',
    admin: 'bg-indigo-100 text-indigo-700',
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-rose-100 text-rose-600',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles[variant]}`}>
      {children}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({ username: '', password: '', email: '', is_admin: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const pwErrors = form.password ? validatePassword(form.password) : []

  async function handleSubmit(e) {
    e.preventDefault()
    if (pwErrors.length > 0) return
    setLoading(true)
    try {
      const user = await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          email: form.email || null,
          is_admin: form.is_admin,
        }),
      })
      toast(`User "${user.username}" created`, 'success')
      onCreated(user)
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Create User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Username</label>
          <input
            required minLength={3} maxLength={50}
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Username"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
          <div className="relative">
            <input
              required type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Password"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.password && pwErrors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {pwErrors.map(e => (
                <li key={e} className="text-[10px] text-rose-500">{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email <span className="font-normal text-slate-400">(optional)</span></label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="user@example.com"
          />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_admin}
            onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700 font-medium">Grant admin privileges</span>
        </label>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !form.username || !form.password || pwErrors.length > 0}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
            {loading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const pwErrors = password ? validatePassword(password) : []

  async function handleSubmit(e) {
    e.preventDefault()
    if (pwErrors.length > 0) return
    setLoading(true)
    try {
      await apiFetch(`/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: password }),
      })
      toast(`Password reset for "${user.username}"`, 'success')
      onDone()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Reset Password — ${user.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Password</label>
          <div className="relative">
            <input
              required type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="New password"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && pwErrors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {pwErrors.map(e => (
                <li key={e} className="text-[10px] text-rose-500">{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !password || pwErrors.length > 0}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminPanel() {
  const toast = useToast()
  const currentUsername = useAuthStore((s) => s.username)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/users')
      setUsers(data)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleDeactivate(user) {
    try {
      await apiFetch(`/users/${user.id}`, { method: 'DELETE' })
      toast(`"${user.username}" deactivated`, 'info')
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: false } : u))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function handleReactivate(user) {
    try {
      await apiFetch(`/users/${user.id}/reactivate`, { method: 'POST' })
      toast(`"${user.username}" reactivated`, 'success')
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: true } : u))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function handleToggleAdmin(user) {
    try {
      const updated = await apiFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_admin: !user.is_admin }),
      })
      toast(`Admin ${updated.is_admin ? 'granted to' : 'removed from'} "${user.username}"`, 'success')
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage accounts, permissions, and access</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create User
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => {
                  const isSelf = user.username === currentUsername
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{user.username}</p>
                            {isSelf && <p className="text-[10px] text-indigo-500 font-medium">You</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{user.email || <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-3.5">
                        {user.is_admin
                          ? <Badge variant="admin"><Shield className="w-3 h-3" />Admin</Badge>
                          : <Badge>User</Badge>
                        }
                      </td>
                      <td className="px-5 py-3.5">
                        {user.is_active
                          ? <Badge variant="active">Active</Badge>
                          : <Badge variant="inactive">Inactive</Badge>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleAdmin(user)}
                            disabled={isSelf && user.is_admin}
                            title={user.is_admin ? 'Remove admin' : 'Grant admin'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {user.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setResetTarget(user)}
                            disabled={!user.is_active}
                            title="Reset password"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          {user.is_active ? (
                            <button
                              onClick={() => handleDeactivate(user)}
                              disabled={isSelf}
                              title="Deactivate user"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(user)}
                              title="Reactivate user"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={user => setUsers(prev => [user, ...prev])}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={loadUsers}
        />
      )}
    </div>
  )
}
