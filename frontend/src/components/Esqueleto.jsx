/**
 * Skeleton de lista/tabela: linhas que esmaecem para baixo.
 * children(i) desenha o conteúdo de cada linha; `linhaClassName` define o layout dela.
 */
export default function Esqueleto({ rotulo, linhas = 6, cabecalho = false, linhaClassName = 'flex items-center gap-4 px-5 py-4', children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" aria-busy="true">
      <span className="sr-only" role="status">{rotulo}</span>
      {cabecalho && <div className="h-10 border-b border-border bg-white/[0.015]" aria-hidden="true" />}
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className={`${linhaClassName} ${i ? 'border-t border-border' : ''}`} style={{ opacity: 1 - i * 0.12 }} aria-hidden="true">
          {children(i)}
        </div>
      ))}
    </div>
  )
}
