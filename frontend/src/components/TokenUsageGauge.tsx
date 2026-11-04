import { useEffect, useState } from 'react'
import { apiRequest, messageOf } from '../lib/api'
import type { RoleTokenUsage, UsageSummary } from '../lib/types'

const POLL_MS = 10_000
const ROLE_LABELS: Record<'primary' | 'secondary', string> = {
  primary: 'Primary',
  secondary: 'Secondary',
}
const TONES = {
  success: { stroke: 'stroke-success', text: 'text-success', bar: 'bg-success' },
  warning: { stroke: 'stroke-warning', text: 'text-warning', bar: 'bg-warning' },
  danger: { stroke: 'stroke-danger', text: 'text-danger', bar: 'bg-danger' },
}

function toneFor(percent: number) {
  if (percent > 85) return TONES.danger
  if (percent >= 60) return TONES.warning
  return TONES.success
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

function RoleRow({ role, data }: { role: 'primary' | 'secondary'; data: RoleTokenUsage }) {
  const tone = toneFor(data.percent)
  return <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="font-medium text-text-main">{ROLE_LABELS[role]}</span>
      <span className="text-text-muted">
        {data.used.toLocaleString()} / {data.limit.toLocaleString()} · {Math.round(data.percent)}%
      </span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-dark-700">
      <div
        className={`h-full rounded-full ${tone.bar} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamp(data.percent)}%` }}
      />
    </div>
  </div>
}

export default function TokenUsageGauge({ connected }: { connected: boolean }) {
  const [data, setData] = useState<UsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) return

    let disposed = false
    let sequence = 0
    let controller: AbortController | null = null

    const load = async () => {
      const current = ++sequence
      controller?.abort()
      const next = new AbortController()
      controller = next
      try {
        const result = await apiRequest<UsageSummary>('/api/usage/summary', { signal: next.signal })
        if (disposed || current !== sequence) return
        setData(result)
        setError(null)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (disposed || current !== sequence) return
        setError(messageOf(cause, 'Usage could not be loaded.'))
      }
    }

    void load()
    const timer = window.setInterval(() => { void load() }, POLL_MS)
    return () => {
      disposed = true
      sequence += 1
      controller?.abort()
      window.clearInterval(timer)
    }
  }, [connected])

  if (!connected) {
    return <p className="text-sm text-text-muted">Connect a YouTube channel to see LLM usage.</p>
  }
  if (error && !data) {
    return <p role="alert" className="text-sm text-danger">{error}</p>
  }
  if (!data) {
    return <p role="status" className="text-sm text-text-muted">Loading LLM usage…</p>
  }

  const { llm } = data
  const tone = toneFor(llm.percent)
  const percent = clamp(llm.percent)
  const angle = -90 + percent * 1.8

  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-text-muted">Last 24 hours</p>
        {error ? <p role="status" className="mt-1 text-xs text-warning">{error}</p> : null}
      </div>
      {data.simulation ? (
        <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
          Simulation
        </span>
      ) : null}
    </div>

    <div className="mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 200 130" role="img" aria-label={`${Math.round(llm.percent)}% of the daily token limit used`}>
        <path
          d="M 18 100 A 82 82 0 0 1 182 100"
          pathLength={100}
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          className="stroke-dark-600"
        />
        <path
          d="M 18 100 A 82 82 0 0 1 182 100"
          pathLength={100}
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={100}
          strokeDashoffset={100 - percent}
          className={tone.stroke}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: '100px 100px',
            transformBox: 'view-box',
            transition: 'transform 700ms ease-out',
          }}
        >
          <line x1={100} y1={100} x2={100} y2={32} strokeWidth={3} strokeLinecap="round" className={tone.stroke} />
          <circle cx={100} cy={100} r={6} className={`fill-current ${tone.text}`} />
        </g>
        <text
          x={100}
          y={124}
          textAnchor="middle"
          className={`fill-current text-[17px] font-semibold ${tone.text}`}
        >
          {Math.round(llm.percent)}%
        </text>
      </svg>
    </div>

    <p className="text-center text-sm text-text-muted">
      {llm.used.toLocaleString()} / {llm.limit.toLocaleString()} tokens
    </p>

    <div className="space-y-3 pt-1">
      <RoleRow role="primary" data={llm.roles.primary} />
      <RoleRow role="secondary" data={llm.roles.secondary} />
    </div>

    {llm.unknown_requests > 0 ? (
      <p className="text-xs text-text-muted">
        {llm.unknown_requests.toLocaleString()} request{llm.unknown_requests === 1 ? '' : 's'} reported no token counts; those are not counted as zero.
      </p>
    ) : null}
  </div>
}
