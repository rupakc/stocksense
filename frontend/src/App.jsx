import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router'
import { BarChart2, Newspaper, TrendingUp, Globe, Star, Briefcase, Menu, X, Zap, Calendar, Settings as SettingsIcon, ShieldAlert, Moon, Sun, Search, Scale, Activity, GitBranch, Building2, ChevronDown, Check, UsersRound } from 'lucide-react'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { useExchangeStore } from './store/exchangeStore'
import Login from './pages/Login'
import ForceChangePassword from './pages/ForceChangePassword'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'
import NewsFeed from './pages/NewsFeed'
import Watchlist from './pages/Watchlist'
import EconomicIndicators from './pages/EconomicIndicators'
import Portfolio from './pages/Portfolio'
import Strategies from './pages/Strategies'
import Earnings from './pages/Earnings'
import Settings from './pages/Settings'
import Risk from './pages/Risk'
import Screener from './pages/Screener'
import Compare from './pages/Compare'
import CorporateActions from './pages/CorporateActions'
import MutualFunds from './pages/MutualFunds'
import Momentum from './pages/Momentum'
import Alerts from './pages/Alerts'
import AdminPanel from './pages/AdminPanel'
import ProtectedAdmin from './components/ProtectedAdmin'

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: BarChart2 },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/strategies', label: 'Strategies', icon: Zap },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/momentum', label: 'Momentum', icon: Activity },
]

const moreNavGroups = [
  { heading: 'Analysis', items: [
    { to: '/screener', label: 'Screener', icon: Search },
    { to: '/compare', label: 'Compare', icon: Scale },
    { to: '/risk', label: 'Risk', icon: ShieldAlert },
  ]},
  { heading: 'Market', items: [
    { to: '/earnings', label: 'Earnings', icon: Calendar },
    { to: '/mutual-funds', label: 'MF Overlap', icon: Building2 },
    { to: '/corporate-actions', label: 'Corp Actions', icon: GitBranch },
    { to: '/economic', label: 'Economy', icon: Globe },
  ]},
]

const moreNavFlat = moreNavGroups.flatMap(g => g.items)
const allNavItems = [...primaryNav, ...moreNavFlat]

function MoreDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  const isMoreActive = moreNavFlat.some(item => item.to === location.pathname)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { setOpen(false) }, [location.pathname])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          isMoreActive
            ? 'bg-indigo-50 text-indigo-600'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        More
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
          {moreNavGroups.map((group) => (
            <div key={group.heading}>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {group.heading}
              </p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="h-1.5" />
        </div>
      )}
    </div>
  )
}

const EXCHANGE_OPTIONS = [
  { id: 'ALL', label: 'All Markets', flag: '🌐' },
  { id: 'NSE', label: 'NSE', flag: '🇮🇳' },
  { id: 'BSE', label: 'BSE', flag: '🇮🇳' },
  { id: 'NASDAQ', label: 'NASDAQ', flag: '🇺🇸' },
]

function ExchangeDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = useExchangeStore((s) => s.selected)
  const setSelected = useExchangeStore((s) => s.setSelected)
  const current = EXCHANGE_OPTIONS.find(e => e.id === selected) || EXCHANGE_OPTIONS[0]

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
      >
        <span>{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] w-44 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exchange</p>
          {EXCHANGE_OPTIONS.map((ex) => (
            <button
              key={ex.id}
              onClick={() => { setSelected(ex.id); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors ${
                selected === ex.id
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="text-base">{ex.flag}</span>
              <span className="flex-1 text-left">{ex.label}</span>
              {selected === ex.id && <Check className="w-3.5 h-3.5 text-indigo-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const username = useAuthStore((s) => s.username)
  const is_admin = useAuthStore((s) => s.is_admin)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-600'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
    }`

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <TrendingUp className="text-indigo-600 w-4 h-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-slate-900">StockSense</span>
          <ExchangeDropdown />
        </div>

        <div className="hidden lg:flex items-center gap-0.5">
          {primaryNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
          {is_admin && (
            <NavLink to="/admin" className={linkClass}>
              <UsersRound className="w-4 h-4" />
              Admin
            </NavLink>
          )}
          <MoreDropdown />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <NavLink to="/settings" className={({ isActive }) =>
            `hidden sm:inline text-xs font-medium px-2 py-1.5 rounded-lg transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`
          }>
            {username}
          </NavLink>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `p-2 rounded-lg transition-colors ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`
            }
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </NavLink>

          <button
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {primaryNav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={linkClass} onClick={() => setMobileOpen(false)}>
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
            {is_admin && (
              <NavLink to="/admin" className={linkClass} onClick={() => setMobileOpen(false)}>
                <UsersRound className="w-4 h-4" />
                Admin
              </NavLink>
            )}
          </div>
          {moreNavGroups.map((group) => (
            <div key={group.heading} className="mt-3">
              <p className="px-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {group.heading}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={linkClass} onClick={() => setMobileOpen(false)}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}

export default function App() {
  const token = useAuthStore((s) => s.token)
  const requiresPasswordChange = useAuthStore((s) => s.requiresPasswordChange)
  const initTheme = useThemeStore((s) => s.init)
  const syncExchange = useExchangeStore((s) => s.syncFromServer)
  const loadExchanges = useExchangeStore((s) => s.loadExchanges)
  useEffect(() => { initTheme() }, [])
  useEffect(() => {
    if (token) {
      syncExchange()
      loadExchanges()
    }
  }, [token])

  if (!token) return <Login />
  if (requiresPasswordChange) return <ForceChangePassword />

  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen flex flex-col bg-slate-50">
          <Nav />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/stock/:symbol" element={<StockDetail />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/news" element={<NewsFeed />} />
                <Route path="/economic" element={<EconomicIndicators />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/risk" element={<Risk />} />
                <Route path="/screener" element={<Screener />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/earnings" element={<Earnings />} />
                <Route path="/momentum" element={<Momentum />} />
                <Route path="/corporate-actions" element={<CorporateActions />} />
                <Route path="/mutual-funds" element={<MutualFunds />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<ProtectedAdmin><AdminPanel /></ProtectedAdmin>} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
