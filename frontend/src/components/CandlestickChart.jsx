import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts'

/* ── Calculation helpers ──────────────────────────────────────────── */

function calcSMA(data, period) {
  const result = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j].close
    result.push({ time: data[i].time, value: +(sum / period).toFixed(2) })
  }
  return result
}

function calcEMA(data, period) {
  const k = 2 / (period + 1)
  const result = []
  let ema = data[0].close
  for (let i = 0; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k)
    if (i >= period - 1) result.push({ time: data[i].time, value: +ema.toFixed(2) })
  }
  return result
}

function calcEMAFromValues(data, period) {
  const k = 2 / (period + 1)
  const result = [{ time: data[0].time, value: data[0].value }]
  for (let i = 1; i < data.length; i++) {
    result.push({
      time: data[i].time,
      value: +(data[i].value * k + result[i - 1].value * (1 - k)).toFixed(4),
    })
  }
  return result
}

function calcBB(data, period = 20, mult = 2) {
  const upper = [], lower = [], mid = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j].close
    const mean = sum / period
    let variance = 0
    for (let j = 0; j < period; j++) variance += (data[i - j].close - mean) ** 2
    const std = Math.sqrt(variance / period)
    mid.push({ time: data[i].time, value: +mean.toFixed(2) })
    upper.push({ time: data[i].time, value: +(mean + mult * std).toFixed(2) })
    lower.push({ time: data[i].time, value: +(mean - mult * std).toFixed(2) })
  }
  return { upper, lower, mid }
}

function calcRSI(data, period = 14) {
  const rsi = []
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push({ time: data[i].time, value: 50 })
      continue
    }
    let gains = 0, losses = 0
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j].close - data[j - 1].close
      if (change > 0) gains += change
      else losses -= change
    }
    const avgGain = gains / period
    const avgLoss = losses / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push({ time: data[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) })
  }
  return rsi
}

function calcMACD(data, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(data, fast)
  const emaSlow = calcEMA(data, slow)
  // Align to the longer EMA length (emaSlow is shorter array)
  const offset = emaFast.length - emaSlow.length
  const macdLine = emaSlow.map((v, i) => ({
    time: v.time,
    value: +(emaFast[i + offset].value - v.value).toFixed(4),
  }))
  const signalLine = calcEMAFromValues(macdLine, signal)
  const histogram = macdLine.map((v, i) => ({
    time: v.time,
    value: +(v.value - signalLine[i].value).toFixed(4),
    color: v.value - signalLine[i].value >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)',
  }))
  return { macdLine, signalLine, histogram }
}

/* ── Overlay color map ────────────────────────────────────────────── */

const COLORS = {
  sma1: '#3b82f6',   // blue-500
  sma2: '#f97316',   // orange-500
  ema1: '#10b981',   // emerald-500
  ema2: '#ef4444',   // red-500
  bb:   '#8b5cf6',   // violet-500
  vol:  '#94a3b8',   // slate-400
  rsi:  '#7c3aed',   // violet-600
  macdLine:   '#3b82f6',
  macdSignal: '#f97316',
}

/* ── Component ────────────────────────────────────────────────────── */

export default function CandlestickChart({ history = [] }) {
  const mainContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const macdContainerRef = useRef(null)
  const mainChartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)
  const mainSeriesRef = useRef({})
  const rsiSeriesRef = useRef(null)
  const macdSeriesRef = useRef({})

  const [overlays, setOverlays] = useState({ volume: true })
  const [smaPeriods, setSmaPeriods] = useState([20, 50])
  const [emaPeriods, setEmaPeriods] = useState([12, 26])
  const [bbPeriod, setBbPeriod] = useState(20)
  const [rsiPeriod, setRsiPeriod] = useState(14)

  const getChartHeight = useCallback(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 300 : 450), [])
  const getPanelHeight = useCallback(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 100 : 120), [])

  const ohlcData = history
    .map(h => {
      const d = new Date(h.timestamp_utc)
      return {
        time: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        open: +h.open.toFixed(2),
        high: +h.high.toFixed(2),
        low: +h.low.toFixed(2),
        close: +h.close.toFixed(2),
        volume: h.volume,
      }
    })
    .filter((v, i, a) => i === 0 || v.time !== a[i - 1].time)

  const toggle = (key) => setOverlays(prev => ({ ...prev, [key]: !prev[key] }))

  /* ── Shared chart options builder ─────────────────────────────── */
  const baseChartOpts = (height) => ({
    height,
    layout: {
      background: { type: ColorType.Solid, color: '#ffffff' },
      textColor: '#64748b',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: '#f1f5f9' },
      horzLines: { color: '#f1f5f9' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#e2e8f0' },
    timeScale: { borderColor: '#e2e8f0', timeVisible: false },
  })

  /* ── Main chart lifecycle ─────────────────────────────────────── */
  useEffect(() => {
    if (!mainContainerRef.current || ohlcData.length === 0) return

    const chartHeight = getChartHeight()
    const chart = createChart(mainContainerRef.current, {
      width: mainContainerRef.current.clientWidth,
      ...baseChartOpts(chartHeight),
    })
    mainChartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(ohlcData)
    mainSeriesRef.current.candle = candleSeries

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        chart.applyOptions({ width: w })
        if (rsiChartRef.current) rsiChartRef.current.applyOptions({ width: w })
        if (macdChartRef.current) macdChartRef.current.applyOptions({ width: w })
      }
    })
    ro.observe(mainContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      mainChartRef.current = null
      mainSeriesRef.current = {}
    }
  }, [JSON.stringify(ohlcData.slice(0, 3)), ohlcData.length])

  /* ── Overlays on main chart ───────────────────────────────────── */
  useEffect(() => {
    const chart = mainChartRef.current
    if (!chart || ohlcData.length < 2) return

    Object.keys(mainSeriesRef.current).forEach(key => {
      if (key !== 'candle') {
        try { chart.removeSeries(mainSeriesRef.current[key]) } catch { /* noop */ }
        delete mainSeriesRef.current[key]
      }
    })

    if (overlays.sma) {
      const s1 = chart.addSeries(LineSeries, { color: COLORS.sma1, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s1.setData(calcSMA(ohlcData, smaPeriods[0]))
      mainSeriesRef.current.sma1 = s1

      const s2 = chart.addSeries(LineSeries, { color: COLORS.sma2, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s2.setData(calcSMA(ohlcData, smaPeriods[1]))
      mainSeriesRef.current.sma2 = s2
    }
    if (overlays.ema) {
      const s1 = chart.addSeries(LineSeries, { color: COLORS.ema1, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s1.setData(calcEMA(ohlcData, emaPeriods[0]))
      mainSeriesRef.current.ema1 = s1

      const s2 = chart.addSeries(LineSeries, { color: COLORS.ema2, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s2.setData(calcEMA(ohlcData, emaPeriods[1]))
      mainSeriesRef.current.ema2 = s2
    }
    if (overlays.bb) {
      const bb = calcBB(ohlcData, bbPeriod, 2)
      const su = chart.addSeries(LineSeries, { color: COLORS.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
      su.setData(bb.upper)
      mainSeriesRef.current.bbUpper = su
      const sm = chart.addSeries(LineSeries, { color: COLORS.bb, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      sm.setData(bb.mid)
      mainSeriesRef.current.bbMid = sm
      const sl = chart.addSeries(LineSeries, { color: COLORS.bb, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
      sl.setData(bb.lower)
      mainSeriesRef.current.bbLower = sl
    }
    if (overlays.volume) {
      const volData = ohlcData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
      }))
      const vs = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      })
      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      })
      vs.setData(volData)
      mainSeriesRef.current.volume = vs
    }
  }, [overlays, ohlcData.length, smaPeriods, emaPeriods, bbPeriod])

  /* ── RSI panel ────────────────────────────────────────────────── */
  useEffect(() => {
    // Cleanup previous RSI chart
    if (rsiChartRef.current) {
      rsiChartRef.current.remove()
      rsiChartRef.current = null
      rsiSeriesRef.current = null
    }

    if (!overlays.rsi || !rsiContainerRef.current || ohlcData.length < 2) return

    const panelHeight = getPanelHeight()
    const width = mainContainerRef.current?.clientWidth || rsiContainerRef.current.clientWidth

    const rsiChart = createChart(rsiContainerRef.current, {
      width,
      ...baseChartOpts(panelHeight),
      rightPriceScale: { borderColor: '#e2e8f0', scaleMargins: { top: 0.1, bottom: 0.1 } },
    })
    rsiChartRef.current = rsiChart

    const rsiData = calcRSI(ohlcData, rsiPeriod)

    // RSI line
    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: COLORS.rsi,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    rsiLine.setData(rsiData)
    rsiSeriesRef.current = rsiLine

    // Overbought line (70)
    const overbought = rsiChart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    overbought.setData(rsiData.map(d => ({ time: d.time, value: 70 })))

    // Oversold line (30)
    const oversold = rsiChart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    oversold.setData(rsiData.map(d => ({ time: d.time, value: 30 })))

    rsiChart.timeScale().fitContent()

    // Sync time scales
    const mainChart = mainChartRef.current
    if (mainChart) {
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) rsiChart.timeScale().setVisibleLogicalRange(range)
      })
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range)
      })
    }

    return () => {
      rsiChart.remove()
      rsiChartRef.current = null
      rsiSeriesRef.current = null
    }
  }, [overlays.rsi, ohlcData.length, rsiPeriod])

  /* ── MACD panel ───────────────────────────────────────────────── */
  useEffect(() => {
    // Cleanup previous MACD chart
    if (macdChartRef.current) {
      macdChartRef.current.remove()
      macdChartRef.current = null
      macdSeriesRef.current = {}
    }

    if (!overlays.macd || !macdContainerRef.current || ohlcData.length < 30) return

    const panelHeight = getPanelHeight()
    const width = mainContainerRef.current?.clientWidth || macdContainerRef.current.clientWidth

    const macdChart = createChart(macdContainerRef.current, {
      width,
      ...baseChartOpts(panelHeight),
    })
    macdChartRef.current = macdChart

    const { macdLine, signalLine, histogram } = calcMACD(ohlcData)

    // Histogram
    const histSeries = macdChart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    })
    histSeries.setData(histogram)
    macdSeriesRef.current.histogram = histSeries

    // MACD line
    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: COLORS.macdLine,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    macdLineSeries.setData(macdLine)
    macdSeriesRef.current.macdLine = macdLineSeries

    // Signal line
    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: COLORS.macdSignal,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    signalLineSeries.setData(signalLine)
    macdSeriesRef.current.signalLine = signalLineSeries

    macdChart.timeScale().fitContent()

    // Sync time scales
    const mainChart = mainChartRef.current
    if (mainChart) {
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) macdChart.timeScale().setVisibleLogicalRange(range)
      })
      macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range)
      })
    }

    return () => {
      macdChart.remove()
      macdChartRef.current = null
      macdSeriesRef.current = {}
    }
  }, [overlays.macd, ohlcData.length])

  /* ── Crosshair sync ───────────────────────────────────────────── */
  useEffect(() => {
    const mainChart = mainChartRef.current
    if (!mainChart) return

    const handlers = [] // [{chart, handler}]

    const makeSyncHandler = (sourceChart, targets) => {
      // targets: [{chart, series}]
      const handler = (param) => {
        targets.forEach(({ chart: tc, series: ts }) => {
          if (!tc || !ts) return
          if (param.time) {
            tc.setCrosshairPosition(NaN, param.time, ts)
          } else {
            tc.clearCrosshairPosition()
          }
        })
      }
      sourceChart.subscribeCrosshairMove(handler)
      handlers.push({ chart: sourceChart, handler })
    }

    const rsiChart = rsiChartRef.current
    const macdChart = macdChartRef.current
    const candleSeries = mainSeriesRef.current.candle
    const rsiSeries = rsiSeriesRef.current
    const macdLineSeries = macdSeriesRef.current.macdLine

    // Main -> sub-panels
    const mainTargets = []
    if (rsiChart && rsiSeries) mainTargets.push({ chart: rsiChart, series: rsiSeries })
    if (macdChart && macdLineSeries) mainTargets.push({ chart: macdChart, series: macdLineSeries })
    if (mainTargets.length > 0) makeSyncHandler(mainChart, mainTargets)

    // RSI -> others
    if (rsiChart && rsiSeries && candleSeries) {
      const rsiTargets = [{ chart: mainChart, series: candleSeries }]
      if (macdChart && macdLineSeries) rsiTargets.push({ chart: macdChart, series: macdLineSeries })
      makeSyncHandler(rsiChart, rsiTargets)
    }

    // MACD -> others
    if (macdChart && macdLineSeries && candleSeries) {
      const macdTargets = [{ chart: mainChart, series: candleSeries }]
      if (rsiChart && rsiSeries) macdTargets.push({ chart: rsiChart, series: rsiSeries })
      makeSyncHandler(macdChart, macdTargets)
    }

    return () => {
      handlers.forEach(({ chart, handler }) => {
        try { chart.unsubscribeCrosshairMove(handler) } catch { /* chart may be disposed */ }
      })
    }
  }, [overlays.rsi, overlays.macd, ohlcData.length])

  /* ── Render ───────────────────────────────────────────────────── */
  if (ohlcData.length === 0) {
    return <div className="h-[450px] flex items-center justify-center text-sm text-slate-400">No data available</div>
  }

  const btnClass = (active) =>
    `text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
      active
        ? 'bg-slate-800 text-white border-slate-800'
        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
    }`

  const periodInputClass = 'w-12 text-xs px-1 py-0.5 border rounded dark:bg-slate-700 dark:border-slate-600'

  return (
    <div>
      {/* Toggle bar with period inputs */}
      <div className="flex flex-wrap gap-1.5 mb-3 items-center">
        {/* SMA */}
        <div className="flex items-center gap-1">
          <button onClick={() => toggle('sma')} className={btnClass(overlays.sma)}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.sma1 }} />
            SMA
          </button>
          {overlays.sma && (
            <div className="flex gap-1">
              <input type="number" value={smaPeriods[0]} onChange={e => setSmaPeriods([+e.target.value, smaPeriods[1]])}
                className={periodInputClass} min="2" max="200" />
              <input type="number" value={smaPeriods[1]} onChange={e => setSmaPeriods([smaPeriods[0], +e.target.value])}
                className={periodInputClass} min="2" max="200" />
            </div>
          )}
        </div>

        {/* EMA */}
        <div className="flex items-center gap-1">
          <button onClick={() => toggle('ema')} className={btnClass(overlays.ema)}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.ema1 }} />
            EMA
          </button>
          {overlays.ema && (
            <div className="flex gap-1">
              <input type="number" value={emaPeriods[0]} onChange={e => setEmaPeriods([+e.target.value, emaPeriods[1]])}
                className={periodInputClass} min="2" max="200" />
              <input type="number" value={emaPeriods[1]} onChange={e => setEmaPeriods([emaPeriods[0], +e.target.value])}
                className={periodInputClass} min="2" max="200" />
            </div>
          )}
        </div>

        {/* Bollinger Bands */}
        <div className="flex items-center gap-1">
          <button onClick={() => toggle('bb')} className={btnClass(overlays.bb)}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.bb }} />
            BB
          </button>
          {overlays.bb && (
            <input type="number" value={bbPeriod} onChange={e => setBbPeriod(+e.target.value)}
              className={periodInputClass} min="2" max="200" />
          )}
        </div>

        {/* Volume */}
        <button onClick={() => toggle('volume')} className={btnClass(overlays.volume)}>
          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.vol }} />
          Volume
        </button>

        {/* RSI */}
        <div className="flex items-center gap-1">
          <button onClick={() => toggle('rsi')} className={btnClass(overlays.rsi)}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.rsi }} />
            RSI
          </button>
          {overlays.rsi && (
            <input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(+e.target.value)}
              className={periodInputClass} min="2" max="100" />
          )}
        </div>

        {/* MACD */}
        <button onClick={() => toggle('macd')} className={btnClass(overlays.macd)}>
          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.macdLine }} />
          MACD
        </button>
      </div>

      {/* Legend bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 min-h-[18px]">
        {overlays.sma && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.sma1 }} />
              <span className="text-xs text-slate-500">SMA {smaPeriods[0]}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.sma2 }} />
              <span className="text-xs text-slate-500">SMA {smaPeriods[1]}</span>
            </span>
          </>
        )}
        {overlays.ema && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.ema1 }} />
              <span className="text-xs text-slate-500">EMA {emaPeriods[0]}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.ema2 }} />
              <span className="text-xs text-slate-500">EMA {emaPeriods[1]}</span>
            </span>
          </>
        )}
        {overlays.bb && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.bb }} />
            <span className="text-xs text-slate-500">BB ({bbPeriod})</span>
          </span>
        )}
        {overlays.volume && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.vol }} />
            <span className="text-xs text-slate-500">Volume</span>
          </span>
        )}
        {overlays.rsi && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.rsi }} />
            <span className="text-xs text-slate-500">RSI ({rsiPeriod})</span>
          </span>
        )}
        {overlays.macd && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.macdLine }} />
              <span className="text-xs text-slate-500">MACD</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: COLORS.macdSignal }} />
              <span className="text-xs text-slate-500">Signal</span>
            </span>
          </>
        )}
      </div>

      {/* Main price chart */}
      <div ref={mainContainerRef} className="rounded-xl overflow-hidden border border-slate-100" />

      {/* RSI panel */}
      {overlays.rsi && (
        <div className="mt-1 relative">
          <span className="absolute top-1 left-2 z-10 text-[10px] font-semibold text-slate-400">RSI ({rsiPeriod})</span>
          <div ref={rsiContainerRef} className="rounded-xl overflow-hidden border border-slate-100" />
        </div>
      )}

      {/* MACD panel */}
      {overlays.macd && (
        <div className="mt-1 relative">
          <span className="absolute top-1 left-2 z-10 text-[10px] font-semibold text-slate-400">MACD (12, 26, 9)</span>
          <div ref={macdContainerRef} className="rounded-xl overflow-hidden border border-slate-100" />
        </div>
      )}
    </div>
  )
}
