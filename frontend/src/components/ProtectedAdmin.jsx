import { useAuthStore } from '../store/authStore'

export default function ProtectedAdmin({ children }) {
  const is_admin = useAuthStore((s) => s.is_admin)
  if (!is_admin) return <div className="p-8 text-center text-slate-500">Access denied.</div>
  return children
}
