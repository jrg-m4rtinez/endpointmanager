import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, EyeOff, LoaderCircle, PartyPopper, RefreshCw, Undo2 } from 'lucide-react'
import { api } from '../api.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCards from '../components/StatCards.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InlineSelect from '../components/InlineSelect.jsx'
import CardErro from '../components/CardErro.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { idOuNull, opcoesComSem } from '../components/opcoes.js'
import { OPCOES_CRITICIDADE } from '../components/Criticidade.jsx'
import { useToast } from '../components/Toast.jsx'

const SAIDA_MS = 320

function faixaFindings(n) {
  if (n >= 15) return 'border-danger/30 bg-danger/10 text-danger'
  if (n >= 5) return 'border-warning/30 bg-warning/10 text-warning'
  if (n >= 1) return 'border-success/30 bg-success/10 text-success'
  return 'border-control bg-white/[0.03] text-muted'
}

function FindingsPill({ n }) {
  return (
    <span
      className={`inline-flex h-6 min-w-9 items-center justify-center rounded-full border px-2 font-mono text-xs font-semibold tabular-nums ${faixaFindings(n)}`}
      title={`${n} ${n === 1 ? 'finding ativo' : 'findings ativos'}`}
    >
      {n}
      <span className="sr-only"> {n === 1 ? 'finding ativo' : 'findings ativos'}</span>
    </span>
  )
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="group inline-flex h-9 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm text-muted transition-colors hover:border-control hover:text-fg disabled:opacity-50"
    >
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-control'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3' : ''}`}
        />
      </span>
      {label}
    </button>
  )
}

function EsqueletoHosts({ admin }) {
  return (
    <Esqueleto rotulo="Carregando hosts…">
      {() => (
        <>
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-44 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-16 animate-pulse rounded-full bg-white/[0.04]" />
          </div>
          <div className="h-6 w-9 animate-pulse rounded-full bg-white/[0.05]" />
          {admin && (
            <div className="hidden gap-2 lg:flex">
              {[0, 1, 2].map(k => <div key={k} className="h-8 w-28 animate-pulse rounded-lg bg-white/[0.04]" />)}
              <div className="h-8 w-8 animate-pulse rounded-lg bg-accent/20" />
            </div>
          )}
        </>
      )}
    </Esqueleto>
  )
}

const GRID_ADMIN = 'lg:grid-cols-[minmax(0,1.5fr)_64px_repeat(3,minmax(0,1fr))_140px]'
const GRID_LEITOR = 'lg:grid-cols-[minmax(0,1fr)_64px]'

function Linha({ item, admin, draft, onDraft, ocupado, saindo, onClassificar, onIgnorar, departamentos, tipos }) {
  const pronto = typeof draft.criticidade === 'number'
  const travado = ocupado || saindo
  return (
    <li
      className={`grid transition-all ease-out ${
        saindo ? 'grid-rows-[0fr] translate-x-4 opacity-0' : 'grid-rows-[1fr] opacity-100'
      }`}
      style={{ transitionDuration: `${SAIDA_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={`flex flex-col gap-3 border-t border-border px-5 py-3.5 transition-colors hover:bg-surface-hover/60 lg:grid lg:items-center lg:gap-3 ${
            admin ? GRID_ADMIN : GRID_LEITOR
          } ${item.ignorado ? 'bg-bg/30' : ''}`}
        >
          <div className="flex items-start justify-between gap-3 lg:contents">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`truncate font-mono text-[13px] font-medium ${item.ignorado ? 'text-muted' : 'text-fg'}`} title={item.host}>
                  {item.host}
                </span>
                {item.ignorado && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-control px-1.5 py-px text-[10px] font-medium tracking-wide text-muted uppercase">
                    <EyeOff className="size-2.5" aria-hidden="true" />
                    Ignorado
                  </span>
                )}
              </div>
              {item.produtos.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Produtos">
                  {item.produtos.map(p => (
                    <li key={p} className="rounded-md border border-accent/20 bg-accent/[0.08] px-1.5 py-px text-[11px] font-medium text-accent-soft">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 lg:flex lg:justify-center">
              <FindingsPill n={item.findingsAtivos} />
            </div>
          </div>

          {admin && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:contents">
                <InlineSelect
                  value={draft.criticidade}
                  onChange={v => onDraft({ criticidade: v })}
                  options={OPCOES_CRITICIDADE}
                  placeholder="Criticidade"
                  aria-label={`Criticidade de ${item.host}`}
                  disabled={travado}
                />
                <InlineSelect
                  value={draft.departamento}
                  onChange={v => onDraft({ departamento: v })}
                  options={departamentos}
                  placeholder="Departamento"
                  aria-label={`Departamento de ${item.host}`}
                  disabled={travado}
                />
                <InlineSelect
                  value={draft.tipo}
                  onChange={v => onDraft({ tipo: v })}
                  options={tipos}
                  placeholder="Tipo"
                  aria-label={`Tipo de ${item.host}`}
                  disabled={travado}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onIgnorar}
                  disabled={travado}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.ignorado ? <Undo2 className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
                  {item.ignorado ? 'Restaurar' : 'Ignorar'}
                  <span className="sr-only"> {item.host}</span>
                </button>
                <button
                  type="button"
                  onClick={onClassificar}
                  disabled={!pronto || travado}
                  aria-label={`Classificar ${item.host}`}
                  title={pronto ? 'Classificar' : 'Escolha a criticidade'}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-control disabled:text-subtle disabled:shadow-none"
                >
                  {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export default function NaoClassificados({ user, stats, onChanged }) {
  const admin = user?.papel === 'admin'
  const { notify } = useToast()

  const [itens, setItens] = useState(null) // null = primeira carga
  const [erro, setErro] = useState(null)
  const [recarregando, setRecarregando] = useState(false)
  const [mostrarIgnorados, setMostrarIgnorados] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [ocupados, setOcupados] = useState(() => new Set())
  const [saindo, setSaindo] = useState(() => new Set())
  const [departamentos, setDepartamentos] = useState([])
  const [tipos, setTipos] = useState([])

  const seq = useRef(0)
  const travas = useRef(new Set()) // guarda síncrona contra duplo clique
  const ignoradosRef = useRef(mostrarIgnorados)
  ignoradosRef.current = mostrarIgnorados

  const carregar = useCallback(({ atualizar = false } = {}) => {
    const meu = ++seq.current
    setRecarregando(true)
    const q = new URLSearchParams()
    if (ignoradosRef.current) q.set('ignorados', '1')
    if (atualizar) q.set('atualizar', '1')
    const qs = q.toString()
    return api(`/nao-classificados${qs ? `?${qs}` : ''}`)
      .then(r => {
        if (meu !== seq.current) return
        setItens(r.itens)
        setErro(null)
        setSaindo(new Set())
      })
      .catch(err => {
        if (meu !== seq.current) return
        setErro(err)
      })
      .finally(() => {
        if (meu === seq.current) setRecarregando(false)
      })
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar, mostrarIgnorados])

  useEffect(() => {
    if (!admin) return
    Promise.all([api('/departamentos'), api('/tipos')])
      .then(([d, t]) => {
        setDepartamentos(opcoesComSem(d, 'Sem departamento'))
        setTipos(opcoesComSem(t, 'Sem tipo'))
      })
      .catch(err => notify(err.message, 'error'))
  }, [admin, notify])

  const marcar = (host, on) => {
    if (on) travas.current.add(host)
    else travas.current.delete(host)
    setOcupados(new Set(travas.current))
  }

  const tirarDaLista = host => {
    setSaindo(s => new Set(s).add(host))
    setTimeout(() => {
      setItens(its => its?.filter(i => i.host !== host) ?? its)
      setSaindo(s => {
        const n = new Set(s)
        n.delete(host)
        return n
      })
    }, SAIDA_MS)
  }

  async function classificar(item) {
    const d = drafts[item.host] || {}
    if (typeof d.criticidade !== 'number' || travas.current.has(item.host)) return
    marcar(item.host, true)
    try {
      await api('/endpoints', {
        method: 'POST',
        body: {
          endpoint: item.host,
          criticidade: d.criticidade,
          departamento_id: idOuNull(d.departamento),
          tipo_id: idOuNull(d.tipo),
        },
      })
      notify(`${item.host} classificado`)
      setDrafts(ds => {
        const n = { ...ds }
        delete n[item.host]
        return n
      })
      tirarDaLista(item.host)
      onChanged?.()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 409) carregar()
    } finally {
      marcar(item.host, false)
    }
  }

  async function alternarIgnorado(item) {
    if (travas.current.has(item.host)) return
    marcar(item.host, true)
    try {
      if (item.ignorado) {
        await api(`/nao-classificados/ignorados/${encodeURIComponent(item.host)}`, { method: 'DELETE' })
        notify(`${item.host} restaurado`)
      } else {
        await api('/nao-classificados/ignorados', { method: 'POST', body: { host: item.host } })
        notify(`${item.host} ignorado`)
      }
      if (ignoradosRef.current) {
        setItens(its => its?.map(i => (i.host === item.host ? { ...i, ignorado: !item.ignorado } : i)) ?? its)
      } else {
        tirarDaLista(item.host)
      }
      onChanged?.()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      marcar(item.host, false)
    }
  }

  const atualizar = () => {
    // Só avisa (ex.: badge de contagem) depois que o cache do DefectDojo foi renovado.
    carregar({ atualizar: true }).then(() => onChanged?.())
  }

  const total = itens?.length ?? 0

  let conteudo
  if (erro) {
    conteudo = (
      <CardErro
        titulo="Não foi possível carregar os hosts"
        mensagem={erro.message}
        detalhe={erro.detalhe}
        tentando={recarregando}
        onRetry={() => carregar({ atualizar: true })}
      />
    )
  } else if (itens === null) {
    conteudo = <EsqueletoHosts admin={admin} />
  } else if (itens.length === 0) {
    conteudo = (
      <EmptyState
        icon={PartyPopper}
        title="Tudo classificado 🎉"
        description={
          mostrarIgnorados
            ? 'Nenhum host do DefectDojo aguarda classificação, nem entre os ignorados.'
            : 'Todos os hosts do DefectDojo já têm criticidade e departamento.'
        }
      />
    )
  } else {
    conteudo = (
      <section
        aria-label="Hosts não classificados"
        aria-busy={recarregando}
        className={`animate-fade-in overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/20 transition-opacity ${
          recarregando ? 'opacity-60' : ''
        }`}
      >
        <div
          className={`hidden px-5 py-2.5 text-[11px] font-medium tracking-wider text-subtle uppercase lg:grid lg:items-center lg:gap-3 ${
            admin ? GRID_ADMIN : GRID_LEITOR
          }`}
          aria-hidden="true"
        >
          <span>Host</span>
          <span className="text-center">Findings</span>
          {admin && (
            <>
              <span>Criticidade</span>
              <span>Departamento</span>
              <span>Tipo</span>
              <span className="text-right">Ações</span>
            </>
          )}
        </div>
        <ul>
          {itens.map(item => (
            <Linha
              key={item.host}
              item={item}
              admin={admin}
              draft={drafts[item.host] || {}}
              onDraft={patch => setDrafts(ds => ({ ...ds, [item.host]: { ...ds[item.host], ...patch } }))}
              ocupado={ocupados.has(item.host)}
              saindo={saindo.has(item.host)}
              onClassificar={() => classificar(item)}
              onIgnorar={() => alternarIgnorado(item)}
              departamentos={departamentos}
              tipos={tipos}
            />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Não classificados"
        description="Hosts do DefectDojo ainda sem criticidade/departamento"
        actions={
          <>
            <Toggle checked={mostrarIgnorados} onChange={setMostrarIgnorados} label="Mostrar ignorados" />
            <button
              type="button"
              onClick={atualizar}
              disabled={recarregando}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-control bg-surface px-3.5 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${recarregando ? 'animate-spin' : ''}`} aria-hidden="true" />
              Atualizar
            </button>
          </>
        }
      />
      <StatCards stats={stats} />
      {!erro && itens?.length > 0 && (
        <p className="-mb-3 text-xs text-muted" aria-live="polite">
          {total.toLocaleString('pt-BR')} {total === 1 ? 'host' : 'hosts'}
          {mostrarIgnorados ? ', incluindo ignorados' : ''}
        </p>
      )}
      {conteudo}
    </div>
  )
}
