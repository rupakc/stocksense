import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAlerts, createAlert, updateAlert, deleteAlert, checkAlerts, getTriggeredAlerts, getWatchlist } from '../services/api'
import { Bell, BellRing, Trash2, Plus, X, CheckCircle, AlertTriangle, RefreshCw, Pencil, RotateCcw, Zap } from 'lucide-react'
import { useToast } from '../components/Toast'
import { useExchangeStore } from '../store/exchangeStore'

const ALERT_LABELS = {
  price_above: 'Price Above',
  price_below: 'Price Below',
  change_pct_above: 'Change % Above',
  change_pct_below: 'Change % Below',
  rsi_above: 'RSI Above',
  rsi_below: 'RSI Below',
  volume_above: 'Volume Above',
}

const ALERT_COLORS = {
  price_above: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  price_below: 'bg-rose-50 border-rose-200 text-rose-700',
  change_pct_above: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  change_pct_below: 'bg-rose-50 border-rose-200 text-rose-700',
  rsi_above: 'bg-amber-50 border-amber-200 text-amber-700',
  rsi_below: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  volume_above: 'bg-purple-50 border-purple-200 text-purple-700',
}

const ALERT_TEMPLATES = [
  { name: 'Stop Loss (-5%)', condition: 'price_below', thresholdFn: (price) => +(price * 0.95).toFixed(2) },
  { name: 'Take Profit (+10%)', condition: 'price_above', thresholdFn: (price) => +(price * 1.10).toFixed(2) },
  { name: 'Volume Spike (2x avg)', condition: 'volume_above', thresholdFn: (_, avgVol) => Math.round((avgVol || 1000000) * 2) },
  { name: 'Big Drop (-3% day)', condition: 'change_pct_below', thresholdFn: () => -3 },
  { name: 'Big Rally (+5% day)', condition: 'change_pct_above', thresholdFn: () => 5 },
]

function formatTimeSince(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function EditAlertModal({ alert, onClose, toast }) {
  const qc = useQueryClient()
  const [type, setType] = useState(alert.alert_type)
  const [threshold, setThreshold] = useState(String(alert.threshold))

  const edit = useMutation({
    mutationFn: (data) => updateAlert(alert.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast('Alert updated', 'success')
      onClose()
    },
    onError: (err) => toast(err?.response?.data?.detail || 'Failed to update alert', 'error'),
  })

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5 space-y-4 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Edit Alert - {alert.symbol.replace(/\.(NS|BO)$/, '')}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Condition</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
              {Object.entries(ALERT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Value</label>
            <input type="number" step="any" value={threshold} onChange={e => setThreshold(e.target.value)}
              className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 text-sm font-semibold text-slate-600 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => edit.mutate({ symbol: alert.symbol, alert_type: type, threshold: parseFloat(threshold) })}
            disabled={!threshold || edit.isPending}
            className="flex-1 text-sm font-semibold bg-indigo-600 text-white py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {edit.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateAlertForm({ onClose, toast, alerts }) {
  const qc = useQueryClient()
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const { data: rawWatchlist = [] } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist })
  const watchlist = rawWatchlist.filter(s => matchesSelected(s.symbol))
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('price_above')
  const [threshold, setThreshold] = useState('')

  const create = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast('Alert created', 'success')
      onClose()
    },
    onError: (err) => toast(err?.response?.data?.detail || 'Failed to create alert', 'error'),
  })

  const handleCreate = () => {
    const parsedThreshold = parseFloat(threshold)
    // Duplicate alert prevention
    const existingAlert = alerts?.find(a =>
      a.symbol === symbol && a.alert_type === type &&
      Math.abs(a.threshold - parsedThreshold) < 0.01 && a.is_active
    )
    if (existingAlert) {
      toast('An identical alert already exists', 'error')
      return
    }
    create.mutate({ symbol, alert_type: type, threshold: parsedThreshold })
  }

  const applyTemplate = (template) => {
    if (!symbol) {
      toast('Select a symbol first', 'error')
      return
    }
    setType(template.condition)
    // Use a rough estimate for price-based templates (user can adjust)
    const estimatedPrice = 1000 // placeholder, user should adjust
    setThreshold(String(template.thresholdFn(estimatedPrice)))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Create Alert</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>

      {/* Quick Templates */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Quick Templates</p>
        <div className="flex flex-wrap gap-1.5">
          {ALERT_TEMPLATES.map(t => (
            <button key={t.name} onClick={() => applyTemplate(t)}
              className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
              <Zap className="w-3 h-3" />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase">Symbol</label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
            <option value="">Select...</option>
            {watchlist.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol.replace(/\.(NS|BO)$/, '')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase">Condition</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
            {Object.entries(ALERT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase">Value</label>
          <input type="number" step="any" value={threshold} onChange={e => setThreshold(e.target.value)}
            placeholder="e.g. 2500" className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2" />
        </div>
      </div>
      {create.isError && (
        <p className="text-xs text-rose-600">{create.error?.response?.data?.detail || 'Failed to create alert'}</p>
      )}
      <button
        onClick={handleCreate}
        disabled={!symbol || !threshold || create.isPending}
        className="w-full text-sm font-semibold bg-indigo-600 text-white py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
      >
        {create.isPending ? 'Creating...' : 'Create Alert'}
      </button>
    </div>
  )
}

export default function Alerts() {
  const qc = useQueryClient()
  const toast = useToast()
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAlert, setEditingAlert] = useState(null)
  const [autoCheck, setAutoCheck] = useState(false)
  const [checkInterval, setCheckInterval] = useState(5)

  const { data: allAlerts = [], isLoading } = useQuery({ queryKey: ['alerts'], queryFn: getAlerts })
  const { data: triggered = [] } = useQuery({ queryKey: ['triggered-alerts'], queryFn: getTriggeredAlerts })
  const alerts = allAlerts.filter(a => matchesSelected(a.symbol))

  // Auto-check polling
  const { data: autoCheckResults } = useQuery({
    queryKey: ['alert-check'],
    queryFn: checkAlerts,
    enabled: autoCheck,
    refetchInterval: autoCheck ? checkInterval * 60 * 1000 : false,
  })

  // Handle auto-check triggered alerts via effect
  useEffect(() => {
    if (autoCheckResults?.length > 0) {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['triggered-alerts'] })
      autoCheckResults.forEach(a => {
        toast(`Alert triggered: ${a.symbol} ${ALERT_LABELS[a.alert_type] || a.alert_type} ${a.threshold}`, 'warning')
      })
    }
  }, [autoCheckResults]) // eslint-disable-line react-hooks/exhaustive-deps

  const check = useMutation({
    mutationFn: checkAlerts,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['triggered-alerts'] })
      if (data?.length > 0) toast(`${data.length} alert(s) triggered!`, 'success')
      else toast('No alerts triggered', 'info')
    },
    onError: () => toast('Failed to check alerts', 'error'),
  })

  const remove = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast('Alert deleted', 'success')
    },
  })

  // Re-arm: reactivate a triggered alert
  const rearm = useMutation({
    mutationFn: (alert) => updateAlert(alert.id, { symbol: alert.symbol, alert_type: alert.alert_type, threshold: alert.threshold }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['triggered-alerts'] })
      toast('Alert re-armed', 'success')
    },
    onError: (err) => toast(err?.response?.data?.detail || 'Failed to re-arm alert', 'error'),
  })

  const activeAlerts = alerts.filter(a => a.is_active)
  const inactiveAlerts = alerts.filter(a => !a.is_active)

  // Stats
  const triggeredToday = inactiveAlerts.filter(a => {
    if (!a.triggered_at) return false
    const t = new Date(a.triggered_at)
    const now = new Date()
    return t.toDateString() === now.toDateString()
  }).length
  const uniqueSymbols = new Set(alerts.map(a => a.symbol)).size

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Price Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">Get notified when stocks hit your target conditions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => check.mutate()}
            disabled={check.isPending}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${check.isPending ? 'animate-spin' : ''}`} />
            Check Now
          </button>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" /> New Alert
          </button>
        </div>
      </div>

      {/* Alert Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200">
          <div className="text-2xl font-bold text-blue-600">{activeAlerts.length}</div>
          <div className="text-xs text-slate-500">Active</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200">
          <div className="text-2xl font-bold text-amber-600">{inactiveAlerts.length}</div>
          <div className="text-xs text-slate-500">Triggered</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200">
          <div className="text-2xl font-bold text-green-600">{triggeredToday}</div>
          <div className="text-xs text-slate-500">Today</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200">
          <div className="text-2xl font-bold text-slate-600">{uniqueSymbols}</div>
          <div className="text-xs text-slate-500">Symbols</div>
        </div>
      </div>

      {/* Auto-Check Toggle */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoCheck} onChange={e => setAutoCheck(e.target.checked)}
            className="rounded" />
          Auto-check every
        </label>
        <select value={checkInterval} onChange={e => setCheckInterval(+e.target.value)}
          className="text-sm border rounded px-2 py-1 dark:bg-slate-700 dark:border-slate-600 border-slate-200">
          <option value={1}>1 min</option>
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
        </select>
        {autoCheck && (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Monitoring
          </span>
        )}
      </div>

      {showCreate && <CreateAlertForm onClose={() => setShowCreate(false)} toast={toast} alerts={alerts} />}

      {editingAlert && (
        <EditAlertModal alert={editingAlert} onClose={() => setEditingAlert(null)} toast={toast} />
      )}

      {check.data?.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
            <BellRing className="w-4 h-4" />
            {check.data.length} alert(s) triggered!
          </p>
          {check.data.map(a => (
            <p key={a.id} className="text-xs text-emerald-600 mt-1">
              {a.symbol}: {ALERT_LABELS[a.alert_type]} {a.threshold} (current: {a.current_value?.toFixed(2)})
            </p>
          ))}
        </div>
      )}

      {/* Active Alerts */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Active Alerts ({activeAlerts.length})
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Bell className="w-7 h-7 text-indigo-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No active alerts</p>
            <p className="text-xs text-slate-400">Create an alert to get notified when conditions are met</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeAlerts.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-indigo-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{a.symbol.replace(/\.(NS|BO)$/, '')}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ALERT_COLORS[a.alert_type] || 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        {ALERT_LABELS[a.alert_type] || a.alert_type}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">{a.threshold.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingAlert(a)}
                    className="text-slate-300 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                    title="Edit alert"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove.mutate(a.id)}
                    className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete alert"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Triggered History */}
      {inactiveAlerts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Triggered ({inactiveAlerts.length})
          </p>
          <div className="space-y-2">
            {inactiveAlerts.map(a => (
              <div key={a.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-600">{a.symbol.replace(/\.(NS|BO)$/, '')}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500">{ALERT_LABELS[a.alert_type]} {a.threshold}</span>
                      {a.triggered_at && (
                        <>
                          <span className="text-[10px] text-slate-400">
                            {new Date(a.triggered_at).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-amber-600 font-medium">
                            {formatTimeSince(a.triggered_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => rearm.mutate(a)}
                    disabled={rearm.isPending}
                    className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                    title="Re-arm alert"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Re-arm
                  </button>
                  <button
                    onClick={() => remove.mutate(a.id)}
                    className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
