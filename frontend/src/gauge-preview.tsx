import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import TokenUsageGauge from './components/TokenUsageGauge'
import type { RoleTokenUsage, UsageSummary } from './lib/types'
import './index.css'

const LIMIT = 200_000
const CYCLE_MS = 20_000
const POLL_MS = 10_000

let autoStartedAt = performance.now()
let manualPercent: number | null = null

const autoPercent = () =>
  (((performance.now() - autoStartedAt) % CYCLE_MS) / CYCLE_MS) * 100
const currentPercent = () => manualPercent ?? autoPercent()

function roleUsage(percent: number): RoleTokenUsage {
  return {
    used: Math.round((percent / 100) * LIMIT),
    limit: LIMIT,
    percent: Math.round(percent * 10) / 10,
  }
}

function fakeSummary(): UsageSummary {
  const primary = roleUsage(currentPercent())
  const secondary = roleUsage(Math.min(100, currentPercent() * 0.62))
  const headline = primary.percent >= secondary.percent ? primary : secondary
  return {
    llm: {
      used: headline.used,
      limit: headline.limit,
      percent: headline.percent,
      roles: { primary, secondary },
      unknown_requests: 2,
    },
    simulation: true,
  }
}

window.fetch = async () => new Response(JSON.stringify(fakeSummary()), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

// TokenUsageGauge polls every 10s. Speed that one interval up so the preview sweeps
// visibly without changing the component itself; every other interval is untouched.
const nativeSetInterval = window.setInterval.bind(window)
window.setInterval = ((handler, timeout, ...args) =>
  nativeSetInterval(handler, timeout === POLL_MS ? 100 : timeout, ...args)) as typeof window.setInterval

export default function Preview() {
  const [manual, setManual] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 100)
    return () => window.clearInterval(timer)
  }, [])

  const percent = manual ?? autoPercent()

  const choose = (value: number | null) => {
    manualPercent = value
    setManual(value)
  }

  return <div className="min-h-screen px-6 py-10">
    <div className="mx-auto w-full max-w-md space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">Preview</p>
        <h1 className="mt-1 text-2xl font-bold">Token usage gauge</h1>
        <p className="mt-1 text-sm text-text-muted">
          Fake data only. The needle ramps 0–100% every 20 seconds and loops.
        </p>
      </div>

      <section className="rounded-2xl border border-dark-600 bg-dark-800/50 backdrop-blur-sm p-6">
        <h2 className="text-lg font-semibold mb-4">LLM usage today</h2>
        <TokenUsageGauge connected />
      </section>

      <section className="rounded-2xl border border-dark-600 bg-dark-800/50 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="percent" className="text-sm font-medium">Percent</label>
          <span className="text-sm text-text-muted">{Math.round(percent)}%</span>
        </div>
        <input
          id="percent"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(percent)}
          onChange={event => choose(Number(event.target.value))}
          className="w-full accent-brand"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            {manual === null ? 'Automatic sweep' : 'Manual override'}
          </span>
          <button
            type="button"
            onClick={() => {
              autoStartedAt = performance.now()
              choose(null)
            }}
            disabled={manual === null}
            className="rounded-lg border border-dark-600 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Resume auto ramp
          </button>
        </div>
      </section>
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<Preview />)
