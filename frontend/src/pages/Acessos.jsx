import { useCallback, useEffect, useRef, useState } from 'react'
import { Hourglass, LoaderCircle, RefreshCw, Users } from 'lucide-react'
import { api } from '../api.js'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InlineSelect from '../components/InlineSelect.jsx'
import CardErro from '../components/CardErro.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { iniciais } from '../components/Sidebar.jsx'
import { useToast } from '../components/Toast.jsx'

const PAPEIS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'leitor', label: 'Leitor' },
  { value: 'admin', label: 'Admin' },
]
const ROTULO = Object.fromEntries(PAPEIS.map(p => [p.value, p.label]))

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })
const UNIDADES = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** "há 2 h", "há 5 min.", "ontem"… */
function relativo(iso, agora = Date.now()) {
  const s = (new Date(iso).getTime() - agora) / 1000
  if (!Number.isFinite(s)) return '—'
  if (Math.abs(s) < 60) return 'agora mesmo'
  for (const [unidade, seg] of UNIDADES) {
    if (Math.abs(s) >= seg) return rtf.format(Math.trunc(s / seg), unidade)
  }
  return 'agora mesmo'
}

const dataCompleta = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })

function Avatar({ nome, pendente }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
        pendente
          ? 'bg-gradient-to-br from-accent to-accent-soft/70 text-white shadow-md shadow-accent/30'
          : 'bg-gradient-to-br from-control to-surface text-fg ring-1 ring-control'
      }`}
    >
      {iniciais(nome)}
    </span>
  )
}

function EsqueletoUsuarios() {
  return (
    <Esqueleto rotulo="Carregando usuários…" linhas={4} cabecalho linhaClassName="flex items-center gap-6 px-5 py-3.5">
      {() => (
        <>
          <div className="flex w-56 items-center gap-3">
            <div className="size-8 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.06]" />
          </div>
          <div className="h-3 w-40 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
          <div className="ml-auto h-8 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        </>
      )}
    </Esqueleto>
  )
}

function Linha({ u, eu, salvando, onPapel }) {
  const pendente = u.papel === 'pendente'
  return (
    <tr
      className={`border-t border-border transition-colors duration-300 ${
        pendente ? 'bg-accent/[0.06] shadow-[inset_2px_0_0] shadow-accent hover:bg-accent/[0.09]' : 'hover:bg-surface-hover/60'
      }`}
    >
      <td className="px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={u.nome || u.email} pendente={pendente} />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-fg" title={u.nome}>{u.nome || '—'}</span>
            {eu && (
              <span className="shrink-0 rounded-full border border-control px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">
                Você
              </span>
            )}
            {pendente && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-1.5 py-px text-[10px] font-semibold tracking-wide text-accent-soft uppercase">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-soft" aria-hidden="true" />
                Aguardando
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="truncate px-3 py-3 font-mono text-[12.5px] text-muted" title={u.email}>{u.email}</td>
      <td className="px-3 py-3 text-sm whitespace-nowrap">
        {u.ultimo_login ? (
          <time dateTime={u.ultimo_login} title={dataCompleta(u.ultimo_login)} className="text-fg/85">
            {relativo(u.ultimo_login)}
          </time>
        ) : (
          <span className="text-subtle italic">Nunca</span>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <span className="grid size-4 place-items-center">
            {salvando && (
              <>
                <LoaderCircle className="size-3.5 animate-spin text-accent-soft" aria-hidden="true" />
                <span className="sr-only" role="status">Salvando papel…</span>
              </>
            )}
          </span>
          <InlineSelect
            value={u.papel}
            onChange={v => onPapel(u, v)}
            options={PAPEIS}
            aria-label={`Papel de ${u.nome || u.email}`}
            disabled={salvando}
            className="w-32"
          />
        </div>
      </td>
    </tr>
  )
}

export default function Acessos({ user, onSessao }) {
  const { notify } = useToast()
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const [recarregando, setRecarregando] = useState(false)
  const [salvando, setSalvando] = useState(() => new Set())

  const seq = useRef(0)
  const travas = useRef(new Set()) // guarda síncrona por usuário contra duplo envio

  const carregar = useCallback(() => {
    const meu = ++seq.current
    setRecarregando(true)
    return api('/usuarios')
      .then(r => {
        if (meu !== seq.current) return
        setLista(r)
        setErro(null)
      })
      .catch(err => {
        if (meu !== seq.current) return
        setErro(err.message)
      })
      .finally(() => {
        if (meu === seq.current) setRecarregando(false)
      })
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const marcar = (id, on) => {
    if (on) travas.current.add(id)
    else travas.current.delete(id)
    setSalvando(new Set(travas.current))
  }

  const aplicar = (id, patch) => setLista(l => l?.map(x => (x.id === id ? { ...x, ...patch } : x)) ?? l)

  async function mudarPapel(u, papel) {
    if (!papel || papel === u.papel || travas.current.has(u.id)) return
    const anterior = u.papel
    marcar(u.id, true)
    aplicar(u.id, { papel }) // salva na hora: o select já mostra o novo valor
    try {
      const r = await api(`/usuarios/${u.id}`, { method: 'PUT', body: { papel } })
      aplicar(u.id, r || { papel })
      notify(`${u.nome || u.email} agora é ${ROTULO[papel]}`)
      if (u.id === user?.id) onSessao?.() // auto-rebaixamento: atualiza a sessão e as abas
    } catch (err) {
      aplicar(u.id, { papel: anterior })
      notify(err.code === 'ultimo_admin' ? 'Precisa existir pelo menos um admin' : err.message, 'error')
      if (err.status === 404) carregar()
    } finally {
      marcar(u.id, false)
    }
  }

  const pendentes = lista?.filter(u => u.papel === 'pendente').length ?? 0

  let conteudo
  if (erro) {
    conteudo = (
      <CardErro titulo="Não foi possível carregar os usuários" mensagem={erro} tentando={recarregando} onRetry={carregar} />
    )
  } else if (lista === null) {
    conteudo = <EsqueletoUsuarios />
  } else if (lista.length === 0) {
    conteudo = (
      <EmptyState icon={Users} title="Nenhum usuário" description="Os usuários aparecem aqui depois do primeiro login." />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-3">
        {pendentes > 0 && (
          <div className="flex animate-fade-in items-center gap-3 rounded-xl border border-accent/25 bg-gradient-to-r from-accent/[0.12] to-accent/[0.03] px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/15 text-accent-soft">
              <Hourglass className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-fg">
              <span className="font-semibold">
                {pendentes === 1 ? '1 usuário aguarda' : `${pendentes.toLocaleString('pt-BR')} usuários aguardam`} liberação.
              </span>{' '}
              <span className="text-muted">Escolha Leitor ou Admin no papel para liberar o acesso.</span>
            </p>
          </div>
        )}
        <div
          className={`animate-fade-in overflow-x-auto rounded-2xl border border-border bg-surface shadow-xl shadow-black/20 transition-opacity ${
            recarregando ? 'opacity-60' : ''
          }`}
          aria-busy={recarregando}
        >
          <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[36%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr className="text-[11px] font-medium tracking-wider text-subtle uppercase">
                <th scope="col" className="px-5 py-2.5 font-medium">Usuário</th>
                <th scope="col" className="px-3 py-2.5 font-medium">E-mail</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Último login</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Papel</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(u => (
                <Linha key={u.id} u={u} eu={u.id === user?.id} salvando={salvando.has(u.id)} onPapel={mudarPapel} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted tabular-nums" aria-live="polite">
          {lista.length.toLocaleString('pt-BR')} {lista.length === 1 ? 'usuário' : 'usuários'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Acessos"
        description="Usuários e seus papéis de acesso. Trocar o papel salva na hora."
        actions={
          <button
            type="button"
            onClick={carregar}
            disabled={recarregando}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-control bg-surface px-3.5 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${recarregando ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
        }
      />
      {conteudo}
    </div>
  )
}
