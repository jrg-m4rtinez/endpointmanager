// Criticidade 1..4 com a mesma paleta do v1.
export const CRITICIDADES = [
  { value: 1, label: 'Baixa', cor: '#22c55e' },
  { value: 2, label: 'Média', cor: '#eab308' },
  { value: 3, label: 'Alta', cor: '#f97316' },
  { value: 4, label: 'Crítica', cor: '#ef4444' },
]

export const OPCOES_CRITICIDADE = CRITICIDADES.map(({ value, label }) => ({ value, label }))

export function critPorValor(v) {
  return CRITICIDADES.find(c => c.value === v)
}

export function CritBadge({ value }) {
  const c = critPorValor(value)
  if (!c) return <span className="text-xs text-subtle">—</span>
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap"
      style={{
        color: c.cor,
        backgroundColor: `color-mix(in srgb, ${c.cor} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${c.cor} 30%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c.cor, boxShadow: `0 0 6px ${c.cor}` }} aria-hidden="true" />
      {c.label}
    </span>
  )
}
