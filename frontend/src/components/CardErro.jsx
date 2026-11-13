import { CloudOff, RefreshCw } from 'lucide-react'

/** Card de erro de carga com "Tentar de novo". `detalhe` (opcional) aparece em mono. */
export default function CardErro({ titulo, mensagem, detalhe, onRetry, tentando = false }) {
  return (
    <div role="alert" className="flex animate-fade-in flex-col items-center rounded-2xl border border-danger/25 bg-gradient-to-b from-danger/[0.07] to-surface px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
        <CloudOff className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{mensagem}</p>
      {detalhe && (
        <p className="mt-3 max-w-md truncate rounded-md border border-border bg-bg/60 px-2.5 py-1 font-mono text-[11px] text-subtle" title={String(detalhe)}>
          {String(detalhe)}
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        disabled={tentando}
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
      >
        <RefreshCw className={`size-4 ${tentando ? 'animate-spin' : ''}`} aria-hidden="true" />
        Tentar de novo
      </button>
    </div>
  )
}
