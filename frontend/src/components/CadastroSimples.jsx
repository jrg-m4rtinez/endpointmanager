import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, LoaderCircle, Pencil, Plus, Search, SearchX, Trash2, TriangleAlert, X } from 'lucide-react'
import { api } from '../api.js'
import PageHeader from './PageHeader.jsx'
import EmptyState from './EmptyState.jsx'
import CardErro from './CardErro.jsx'
import { useToast } from './Toast.jsx'

const DESTAQUE_MS = 1800

const fmt = n => n.toLocaleString('pt-BR')
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1)
// Busca sem diferenciar maiúsculas nem acentos ("aplicacao" acha "Aplicação").
const normalizar = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const btnIcone =
  'grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'
const btnSalvar =
  'grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-control disabled:text-subtle disabled:shadow-none'
const inputBase =
  'h-8 w-full min-w-0 rounded-lg border border-control bg-bg/60 px-2.5 text-sm text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40'

function EsqueletoCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      <span className="sr-only" role="status">Carregando…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
          style={{ opacity: 1 - i * 0.1 }}
          aria-hidden="true"
        >
          <div className="size-9 animate-pulse rounded-lg bg-accent/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Card({ item, icone: Icone, singular, admin, modo, destaque, edit, setEdit, ocupado, bloqueado, onEditar, onSalvar, onCancelar, onPedirRemover, onRemover }) {
  const n = item.total_endpoints

  if (modo === 'editar') {
    const pronto = edit.nome.trim() !== ''
    return (
      <li
        className="flex animate-fade-in items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.06] px-3 py-2.5 shadow-[0_0_0_3px] shadow-accent/10"
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancelar()
          } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault()
            onSalvar()
          }
        }}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/15 text-accent-soft">
          <Icone className="size-4" aria-hidden="true" />
        </span>
        <input
          autoFocus
          type="text"
          value={edit.nome}
          onChange={e => setEdit(s => ({ ...s, nome: e.target.value }))}
          onFocus={e => e.target.select()}
          aria-label={`Novo nome de ${item.nome}`}
          maxLength={120}
          autoComplete="off"
          disabled={ocupado}
          className={`${inputBase} disabled:opacity-50`}
        />
        <button type="button" onClick={onSalvar} disabled={!pronto || ocupado} aria-label="Salvar nome" title="Salvar (Enter)" className={btnSalvar}>
          {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
        </button>
        <button type="button" onClick={onCancelar} disabled={ocupado} aria-label="Cancelar edição" title="Cancelar (Esc)" className={btnIcone}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </li>
    )
  }

  if (modo === 'confirmar') {
    return (
      <li
        className="flex animate-fade-in flex-col gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] px-3.5 py-3"
        onKeyDown={e => e.key === 'Escape' && onCancelar()}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
            <Trash2 className="size-4" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-fg">
            Remover <span className="font-semibold break-words">{item.nome}</span>?
          </p>
        </div>
        {n > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning/[0.07] px-2.5 py-1.5 text-xs leading-snug text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {n === 1 ? `1 endpoint ficará sem ${singular}` : `${fmt(n)} endpoints ficarão sem ${singular}`}
          </p>
        )}
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onRemover}
            disabled={ocupado}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-danger/90 px-2.5 text-xs font-semibold text-bg transition-colors hover:bg-danger disabled:opacity-60"
          >
            {ocupado && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
            Sim, remover
          </button>
          <button
            type="button"
            autoFocus
            onClick={onCancelar}
            disabled={ocupado}
            className="inline-flex h-7 items-center rounded-md border border-control px-2.5 text-xs font-medium text-fg transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            Não
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 transition-all duration-500 ${
        destaque
          ? 'border-accent/50 bg-accent/[0.10] shadow-lg shadow-accent/10'
          : 'border-border bg-surface hover:-translate-y-px hover:border-control hover:bg-surface-hover/70 hover:shadow-lg hover:shadow-black/25'
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/20 bg-gradient-to-br from-accent/15 to-accent/5 text-accent-soft transition-colors group-hover:border-accent/35">
        <Icone className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg" title={item.nome}>{item.nome}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="font-mono text-[11px] text-subtle">#{item.id}</span>
          <span className="text-control" aria-hidden="true">•</span>
          <span className={`tabular-nums ${n > 0 ? 'text-muted' : 'text-subtle'}`}>{plural(n, 'endpoint', 'endpoints')}</span>
        </p>
      </div>
      {admin && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" onClick={onEditar} disabled={bloqueado} aria-label={`Editar ${item.nome}`} title="Editar" className={btnIcone}>
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onPedirRemover}
            disabled={bloqueado}
            aria-label={`Remover ${item.nome}`}
            title="Remover"
            className={`${btnIcone} hover:bg-danger/10 hover:text-danger`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Cadastro de nomes (Departamentos, Tipos): busca, cards, criar/editar inline, remover com confirmação.
 * rota: '/departamentos' | '/tipos'; singular: 'departamento' | 'tipo'.
 */
export default function CadastroSimples({ titulo, descricao, rota, icone, singular, user }) {
  const admin = user?.papel === 'admin'
  const { notify } = useToast()
  const Singular = maiuscula(singular)

  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const [tentando, setTentando] = useState(false)
  const [busca, setBusca] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [edit, setEdit] = useState(null) // { id, nome }
  const [confirmando, setConfirmando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [destaque, setDestaque] = useState(null)

  const trava = useRef(false) // guarda síncrona contra duplo clique
  const seq = useRef(0)
  const novoRef = useRef(null)

  const carregar = useCallback(() => {
    const meu = ++seq.current
    setTentando(true)
    return api(rota)
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
        if (meu === seq.current) setTentando(false)
      })
  }, [rota])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (destaque === null) return
    const t = setTimeout(() => setDestaque(null), DESTAQUE_MS)
    return () => clearTimeout(t)
  }, [destaque])

  const filtrados = useMemo(() => {
    if (!lista) return []
    const q = normalizar(busca.trim())
    return q ? lista.filter(x => x.id === edit?.id || normalizar(x.nome).includes(q)) : lista
  }, [lista, busca, edit?.id])

  async function criar() {
    const nome = novoNome.trim()
    if (!nome || trava.current) return
    trava.current = true
    setCriando(true)
    try {
      const r = await api(rota, { method: 'POST', body: { nome } })
      notify(`${Singular} “${r?.nome ?? nome}” criado`)
      setNovoNome('')
      setDestaque(r?.id ?? null)
      await carregar()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 409) carregar()
    } finally {
      trava.current = false
      setCriando(false)
      novoRef.current?.focus()
    }
  }

  function editar(item) {
    if (trava.current) return
    setConfirmando(null)
    setEdit({ id: item.id, nome: item.nome })
  }

  function pedirRemover(item) {
    if (trava.current) return
    setEdit(null)
    setConfirmando(item.id)
  }

  const cancelar = () => {
    if (trava.current) return
    setEdit(null)
    setConfirmando(null)
  }

  async function salvar(item) {
    if (!edit || trava.current) return
    const nome = edit.nome.trim()
    if (!nome) return
    if (nome === item.nome) {
      setEdit(null)
      return
    }
    trava.current = true
    setOcupado(true)
    try {
      const r = await api(`${rota}/${item.id}`, { method: 'PUT', body: { nome } })
      notify(`${Singular} “${r?.nome ?? nome}” atualizado`)
      setEdit(null)
      setDestaque(item.id)
      await carregar()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 404) {
        setEdit(null)
        carregar()
      }
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  async function remover(item) {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    try {
      await api(`${rota}/${item.id}`, { method: 'DELETE' })
      notify(`${Singular} “${item.nome}” removido`)
      setConfirmando(null)
      setLista(l => l?.filter(x => x.id !== item.id) ?? l)
      carregar()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 404) {
        setConfirmando(null)
        carregar()
      }
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  const total = lista?.length ?? 0
  const filtroAtivo = busca.trim() !== ''

  const formNovo = admin && lista !== null && !erro && (
    <form
      onSubmit={e => {
        e.preventDefault()
        criar()
      }}
      className="group/novo flex items-center gap-2 rounded-2xl border border-dashed border-control/80 bg-surface/50 p-2 pl-3 transition-colors focus-within:border-solid focus-within:border-accent/50 focus-within:bg-surface focus-within:shadow-[0_0_0_3px] focus-within:shadow-accent/10 hover:border-subtle"
    >
      <Plus className="size-4 shrink-0 text-subtle transition-colors group-focus-within/novo:text-accent-soft" aria-hidden="true" />
      <input
        ref={novoRef}
        type="text"
        value={novoNome}
        onChange={e => setNovoNome(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && setNovoNome('')}
        placeholder={`Novo ${singular}…`}
        aria-label={`Nome do novo ${singular}`}
        maxLength={120}
        autoComplete="off"
        readOnly={criando}
        className="h-8 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
      />
      <button
        type="submit"
        disabled={!novoNome.trim() || criando}
        aria-label={`Criar ${singular}`}
        title="Criar (Enter)"
        className={btnSalvar}
      >
        {criando ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
      </button>
    </form>
  )

  let conteudo
  if (erro) {
    conteudo = (
      <CardErro
        titulo={`Não foi possível carregar os ${titulo.toLowerCase()}`}
        mensagem={erro}
        tentando={tentando}
        onRetry={carregar}
      />
    )
  } else if (lista === null) {
    conteudo = <EsqueletoCards />
  } else if (total === 0) {
    conteudo = (
      <EmptyState
        icon={icone}
        title={`Nenhum ${singular} cadastrado`}
        description={
          admin
            ? `Digite um nome no campo acima e confirme para criar o primeiro ${singular}.`
            : `Um administrador ainda não cadastrou nenhum ${singular}.`
        }
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="search">
          <label className="relative min-w-52 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar {singular}</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={`Buscar ${singular}…`}
              className="h-8 w-full rounded-lg border border-control bg-bg/40 pr-2.5 pl-8 text-xs text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          <span className="ml-auto text-xs text-muted tabular-nums" aria-live="polite">
            {filtroAtivo ? `${fmt(filtrados.length)} de ${fmt(total)}` : plural(total, singular, titulo.toLowerCase())}
          </span>
        </div>

        {filtrados.length === 0 ? (
          <div className="flex animate-fade-in flex-col items-center rounded-2xl border border-dashed border-control/70 bg-surface/40 px-6 py-12 text-center">
            <SearchX className="mb-3 size-5 text-subtle" aria-hidden="true" />
            <p className="text-sm text-muted">
              Nenhum {singular} corresponde a <span className="font-medium text-fg">“{busca.trim()}”</span>.
            </p>
            <button
              type="button"
              onClick={() => setBusca('')}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-control px-3 text-xs font-medium text-fg transition-colors hover:bg-white/5"
            >
              <X className="size-3.5" aria-hidden="true" />
              Limpar busca
            </button>
          </div>
        ) : (
          <ul aria-label={titulo} className="grid animate-fade-in grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map(item => (
              <Card
                key={item.id}
                item={item}
                icone={icone}
                singular={singular}
                admin={admin}
                modo={edit?.id === item.id ? 'editar' : confirmando === item.id ? 'confirmar' : 'ler'}
                destaque={destaque === item.id}
                edit={edit}
                setEdit={setEdit}
                ocupado={ocupado}
                bloqueado={ocupado || criando}
                onEditar={() => editar(item)}
                onSalvar={() => salvar(item)}
                onCancelar={cancelar}
                onPedirRemover={() => pedirRemover(item)}
                onRemover={() => remover(item)}
              />
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={titulo} description={descricao} />
      {formNovo}
      {conteudo}
    </div>
  )
}
