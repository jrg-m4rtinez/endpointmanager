import { Building2, Hexagon, Inbox, LogOut, Server, ShieldCheck, Tags } from 'lucide-react'

export const ABAS = [
  { id: 'endpoints', label: 'Endpoints', icon: Server },
  { id: 'nao-classificados', label: 'Não classificados', icon: Inbox, badge: true },
  { id: 'departamentos', label: 'Departamentos', icon: Building2 },
  { id: 'tipos', label: 'Tipos', icon: Tags },
  { id: 'acessos', label: 'Acessos', icon: ShieldCheck, adminOnly: true },
]

export function abasVisiveis(user) {
  return ABAS.filter(a => !a.adminOnly || user?.papel === 'admin')
}

const PAPEL = { admin: 'Administrador', leitor: 'Leitor', pendente: 'Pendente' }

export function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const a = partes[0][0]
  const b = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] || ''
  return (a + b).toUpperCase()
}

/** Tooltip à direita do item. O pai precisa da classe `group/tip relative`. */
function Tip({ children }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-1/2 left-full z-40 ml-3 -translate-x-1 -translate-y-1/2 rounded-md border border-control bg-surface px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-fg opacity-0 shadow-xl shadow-black/40 transition-all duration-150 group-hover/tip:translate-x-0 group-hover/tip:opacity-100 group-focus-visible/tip:translate-x-0 group-focus-visible/tip:opacity-100"
    >
      {children}
    </span>
  )
}

const SAUDE = {
  ok: { cor: 'bg-success shadow-[0_0_8px] shadow-success/60', txt: 'ok' },
  erro: { cor: 'bg-danger shadow-[0_0_8px] shadow-danger/60', txt: 'com erro' },
  nao_configurado: { cor: 'bg-subtle', txt: 'não configurado' },
}

function HealthDot({ label, status }) {
  const s = SAUDE[status] || { cor: 'bg-control animate-pulse', txt: 'verificando…' }
  const texto = `${label}: ${s.txt}`
  return (
    <span tabIndex={0} aria-label={texto} role="img" className="group/tip relative grid size-5 place-items-center rounded-full">
      <span className={`size-2 rounded-full ${s.cor}`} />
      <Tip>{texto}</Tip>
    </span>
  )
}

/**
 * Sidebar estreita (56 px) só com ícones.
 * Props: aba, onChange(id), user, health { db, defectdojo }, onLogout, pendentes (badge).
 */
export default function Sidebar({ aba, onChange, user, health, onLogout, pendentes }) {
  const abas = abasVisiveis(user)

  return (
    <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
      <div
        className="mb-4 grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-soft/70 shadow-lg shadow-accent/25"
        title="Endpoint Manager"
      >
        <Hexagon className="size-4.5 text-white" strokeWidth={2.4} aria-hidden="true" />
        <span className="sr-only">Endpoint Manager</span>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col items-center gap-1.5">
        {abas.map(({ id, label, icon: Icon, badge }) => {
          const ativa = aba === id
          const contagem = badge && typeof pendentes === 'number' && pendentes > 0 ? pendentes : null
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-label={contagem ? `${label} (${contagem})` : label}
              aria-current={ativa ? 'page' : undefined}
              className={`group/tip relative grid size-10 place-items-center rounded-xl transition-all duration-150 ${
                ativa
                  ? 'bg-accent/15 text-accent-soft shadow-[inset_0_0_0_1px] shadow-accent/30'
                  : 'text-muted hover:bg-white/5 hover:text-fg'
              }`}
            >
              {ativa && (
                <span className="absolute top-2 bottom-2 -left-2 w-0.5 rounded-r-full bg-accent-soft" aria-hidden="true" />
              )}
              <Icon className="size-[18px]" strokeWidth={ativa ? 2.2 : 1.8} aria-hidden="true" />
              {contagem && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 min-w-[18px] rounded-full border-2 border-sidebar bg-accent px-1 text-center text-[10px] leading-[14px] font-bold text-white tabular-nums"
                >
                  {contagem > 99 ? '99+' : contagem}
                </span>
              )}
              <Tip>{label}</Tip>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-col items-center gap-0.5 rounded-full border border-border bg-bg/60 p-0.5">
          <HealthDot label="Banco de dados" status={health?.db} />
          <HealthDot label="DefectDojo" status={health?.defectdojo} />
        </div>

        <span
          tabIndex={0}
          className="group/tip relative grid size-8 place-items-center rounded-full bg-gradient-to-br from-control to-surface text-[11px] font-semibold text-fg ring-1 ring-control"
          aria-label={`${user?.nome || 'Usuário'} — ${PAPEL[user?.papel] || ''}`}
          role="img"
        >
          <span aria-hidden="true">{iniciais(user?.nome || user?.email)}</span>
          <Tip>
            <span className="block text-fg">{user?.nome}</span>
            <span className="block font-normal text-muted">
              {user?.email} · {PAPEL[user?.papel]}
            </span>
          </Tip>
        </span>

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          className="group/tip relative grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <Tip>Sair</Tip>
        </button>
      </div>
    </aside>
  )
}
