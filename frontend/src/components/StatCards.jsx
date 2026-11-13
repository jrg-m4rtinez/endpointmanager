import { useId } from 'react'
import { CircleCheck, Inbox, ShieldAlert } from 'lucide-react'

const fmt = n => (typeof n === 'number' ? n.toLocaleString('pt-BR') : '—')

function Card({ label, value, icon: Icon, tone, tooltip }) {
  const tipId = useId()
  const tones = {
    accent: {
      value: 'text-accent-soft',
      icon: 'bg-accent/15 text-accent-soft border-accent/25',
      glow: 'from-accent/20',
    },
    neutral: {
      value: 'text-fg',
      icon: 'bg-white/5 text-muted border-control',
      glow: 'from-white/5',
    },
    danger: {
      value: 'text-danger',
      icon: 'bg-danger/10 text-danger border-danger/25',
      glow: 'from-danger/15',
    },
  }[tone]

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-control">
      <div
        className={`pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-radial ${tones.glow} to-transparent opacity-70 blur-2xl`}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className={`grid size-7 place-items-center rounded-lg border ${tones.icon}`}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? (
        <div className="relative mt-3 h-8 w-16 animate-pulse rounded-md bg-white/5"><span className="sr-only">Carregando</span></div>
      ) : tooltip ? (
        <span className="group/tip relative mt-2 inline-block">
          <span
            tabIndex={0}
            aria-describedby={tipId}
            className={`block cursor-help text-3xl font-semibold tabular-nums tracking-tight rounded-md ${tones.value}`}
          >
            —
          </span>
          <span
            id={tipId}
            role="tooltip"
            className="pointer-events-none absolute top-full left-0 z-10 mt-1 rounded-md border border-control bg-sidebar px-2 py-1 text-xs whitespace-nowrap text-fg opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
          >
            {tooltip}
          </span>
        </span>
      ) : (
        <div className={`relative mt-2 text-3xl font-semibold tabular-nums tracking-tight ${tones.value}`}>
          {fmt(value)}
        </div>
      )}
    </div>
  )
}

/**
 * stats: { pendentes: number|null, classificados, criticos } ou null enquanto carrega.
 */
export default function StatCards({ stats }) {
  const carregando = !stats
  return (
    <section aria-label="Resumo" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card
        label="Pendentes"
        icon={Inbox}
        tone="accent"
        value={carregando ? undefined : stats.pendentes}
        tooltip={!carregando && stats.pendentes === null ? 'DefectDojo indisponível' : null}
      />
      <Card label="Classificados" icon={CircleCheck} tone="neutral" value={carregando ? undefined : stats.classificados} />
      <Card label="Críticos" icon={ShieldAlert} tone="danger" value={carregando ? undefined : stats.criticos} />
    </section>
  )
}
