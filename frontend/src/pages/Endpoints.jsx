import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, FilterX, LoaderCircle, Pencil, Plus, Search, Server, Trash2, X } from 'lucide-react'
import { api } from '../api.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCards from '../components/StatCards.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InlineSelect from '../components/InlineSelect.jsx'
import CardErro from '../components/CardErro.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { SEM, idOuNull, opcoesComSem } from '../components/opcoes.js'
import { CritBadge, OPCOES_CRITICIDADE } from '../components/Criticidade.jsx'
import { useToast } from '../components/Toast.jsx'

const TODOS = 'todos'
const NOVO = 'novo'
const DESTAQUE_MS = 1800

const paraSelect = id => (id === null || id === undefined ? SEM : id)

const btnIcone =
  'grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'

function EsqueletoEndpoints() {
  return (
    <Esqueleto rotulo="Carregando endpoints…" cabecalho linhaClassName="flex items-center gap-6 px-5 py-4">
      {() => (
        <>
          <div className="h-3.5 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
        </>
      )}
    </Esqueleto>
  )
}

function LinhaEdicao({ edit, setEdit, salvando, onSalvar, onCancelar, departamentos, tipos }) {
  const novo = edit.id === NOVO
  const pronto = edit.endpoint.trim() !== '' && typeof edit.criticidade === 'number'
  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancelar()
    } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault()
      onSalvar()
    }
  }
  return (
    <tr onKeyDown={onKeyDown} className="animate-fade-in border-t border-border bg-accent/[0.06] shadow-[inset_2px_0_0] shadow-accent">
      <td className="px-5 py-2.5">
        <input
          autoFocus
          type="text"
          value={edit.endpoint}
          onChange={e => setEdit(s => ({ ...s, endpoint: e.target.value }))}
          placeholder="host.exemplo.com"
          aria-label="Host"
          spellCheck={false}
          autoComplete="off"
          disabled={salvando}
          className="h-8 w-full rounded-lg border border-control bg-bg/60 px-2.5 font-mono text-[13px] text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        />
      </td>
      <td className="px-3 py-2.5">
        <InlineSelect
          value={edit.criticidade}
          onChange={v => setEdit(s => ({ ...s, criticidade: v }))}
          options={OPCOES_CRITICIDADE}
          placeholder="Criticidade"
          disabled={salvando}
        />
      </td>
      <td className="px-3 py-2.5">
        <InlineSelect
          value={edit.departamento}
          onChange={v => setEdit(s => ({ ...s, departamento: v }))}
          options={departamentos}
          placeholder="Departamento"
          disabled={salvando}
        />
      </td>
      <td className="px-3 py-2.5">
        <InlineSelect
          value={edit.tipo}
          onChange={v => setEdit(s => ({ ...s, tipo: v }))}
          options={tipos}
          placeholder="Tipo"
          disabled={salvando}
        />
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onSalvar}
            disabled={!pronto || salvando}
            aria-label={novo ? 'Salvar novo endpoint' : 'Salvar alterações'}
            title="Salvar (Enter)"
            className="grid size-8 place-items-center rounded-lg bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-control disabled:text-subtle disabled:shadow-none"
          >
            {salvando ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />}
          </button>
          <button type="button" onClick={onCancelar} disabled={salvando} aria-label="Cancelar edição" title="Cancelar (Esc)" className={btnIcone}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function LinhaLeitura({ e, admin, destaque, confirmando, removendo, bloqueado, onEditar, onPedirRemover, onRemover, onCancelarRemover }) {
  return (
    <tr
      className={`group border-t border-border transition-colors duration-700 ${
        destaque ? 'bg-accent/[0.10]' : confirmando ? 'bg-danger/[0.05]' : 'hover:bg-surface-hover/60'
      }`}
    >
      <td className="px-5 py-3">
        <span className="block truncate font-mono text-[13px] font-medium text-fg" title={e.endpoint}>{e.endpoint}</span>
      </td>
      <td className="px-3 py-3"><CritBadge value={e.criticidade} /></td>
      <td className="truncate px-3 py-3 text-sm">
        {e.departamento_nome ? <span className="text-fg/90">{e.departamento_nome}</span> : <span className="text-subtle italic">Sem departamento</span>}
      </td>
      <td className="truncate px-3 py-3 text-sm">
        {e.tipo_nome ? <span className="text-muted">{e.tipo_nome}</span> : <span className="text-subtle italic">Sem tipo</span>}
      </td>
      {admin && (
        <td className="px-5 py-3">
          {confirmando ? (
            <div
              className="flex animate-fade-in items-center justify-end gap-1.5"
              onKeyDown={ev => ev.key === 'Escape' && onCancelarRemover()}
            >
              <span className="mr-1 text-xs font-medium text-danger">Remover?</span>
              <button
                type="button"
                onClick={onRemover}
                disabled={removendo}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-danger/90 px-2.5 text-xs font-semibold text-bg transition-colors hover:bg-danger disabled:opacity-60"
              >
                {removendo && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
                Sim
              </button>
              <button
                type="button"
                autoFocus
                onClick={onCancelarRemover}
                disabled={removendo}
                className="inline-flex h-7 items-center rounded-md border border-control px-2.5 text-xs font-medium text-fg transition-colors hover:bg-white/5 disabled:opacity-60"
              >
                Não
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" onClick={onEditar} disabled={bloqueado} aria-label={`Editar ${e.endpoint}`} title="Editar" className={btnIcone}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onPedirRemover}
                disabled={bloqueado}
                aria-label={`Remover ${e.endpoint}`}
                title="Remover"
                className={`${btnIcone} hover:bg-danger/10 hover:text-danger`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

export default function Endpoints({ user, stats, onChanged }) {
  const admin = user?.papel === 'admin'
  const { notify } = useToast()

  const [lista, setLista] = useState(null)
  const [depsRaw, setDepsRaw] = useState([])
  const [tiposRaw, setTiposRaw] = useState([])
  const [erro, setErro] = useState(null)

  const [busca, setBusca] = useState('')
  const [fCrit, setFCrit] = useState(TODOS)
  const [fDep, setFDep] = useState(TODOS)
  const [fTipo, setFTipo] = useState(TODOS)

  const [edit, setEdit] = useState(null) // { id: number|'novo', endpoint, criticidade, departamento, tipo }
  const [salvando, setSalvando] = useState(false)
  const [confirmando, setConfirmando] = useState(null)
  const [removendo, setRemovendo] = useState(false)
  const [destaque, setDestaque] = useState(null)

  const trava = useRef(false) // guarda síncrona contra duplo clique
  const seq = useRef(0)

  const carregar = useCallback(() => {
    const meu = ++seq.current
    return Promise.all([api('/endpoints'), api('/departamentos'), api('/tipos')])
      .then(([e, d, t]) => {
        if (meu !== seq.current) return
        setLista(e)
        setDepsRaw(d)
        setTiposRaw(t)
        setErro(null)
      })
      .catch(err => {
        if (meu !== seq.current) return
        setErro(err.message)
      })
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (destaque === null) return
    const t = setTimeout(() => setDestaque(null), DESTAQUE_MS)
    return () => clearTimeout(t)
  }, [destaque])

  const departamentos = useMemo(
    () => opcoesComSem(depsRaw, 'Sem departamento'),
    [depsRaw]
  )
  const tipos = useMemo(
    () => opcoesComSem(tiposRaw, 'Sem tipo'),
    [tiposRaw]
  )

  const filtroAtivo = busca.trim() !== '' || fCrit !== TODOS || fDep !== TODOS || fTipo !== TODOS
  const limparFiltros = () => {
    setBusca('')
    setFCrit(TODOS)
    setFDep(TODOS)
    setFTipo(TODOS)
  }

  const filtrados = useMemo(() => {
    if (!lista) return []
    const q = busca.trim().toLowerCase()
    const casa = (f, id) => f === TODOS || (f === SEM ? id === null : id === f)
    return lista.filter(
      e =>
        e.id === edit?.id || // a linha em edição não some por causa do filtro
        ((!q || e.endpoint.toLowerCase().includes(q) || (e.departamento_nome || '').toLowerCase().includes(q)) &&
          (fCrit === TODOS || e.criticidade === fCrit) &&
          casa(fDep, e.departamento_id) &&
          casa(fTipo, e.tipo_id))
    )
  }, [lista, busca, fCrit, fDep, fTipo, edit?.id])

  function novo() {
    if (trava.current) return
    setConfirmando(null)
    setEdit({ id: NOVO, endpoint: '', criticidade: null, departamento: null, tipo: null })
  }

  function editar(e) {
    if (trava.current) return
    setConfirmando(null)
    setEdit({
      id: e.id,
      endpoint: e.endpoint,
      criticidade: e.criticidade,
      departamento: paraSelect(e.departamento_id),
      tipo: paraSelect(e.tipo_id),
    })
  }

  const cancelar = () => {
    if (!trava.current) setEdit(null)
  }

  async function salvar() {
    if (!edit || trava.current) return
    const endpoint = edit.endpoint.trim()
    if (!endpoint || typeof edit.criticidade !== 'number') return
    const ehNovo = edit.id === NOVO
    trava.current = true
    setSalvando(true)
    try {
      const r = await api(ehNovo ? '/endpoints' : `/endpoints/${edit.id}`, {
        method: ehNovo ? 'POST' : 'PUT',
        body: {
          endpoint,
          criticidade: edit.criticidade,
          departamento_id: idOuNull(edit.departamento),
          tipo_id: idOuNull(edit.tipo),
        },
      })
      notify(ehNovo ? `${endpoint} adicionado` : `${endpoint} atualizado`)
      setEdit(null)
      setDestaque(r?.id ?? null)
      await carregar()
      onChanged?.()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 409) carregar() // alguém criou o mesmo host: mostra a lista atual
      if (err.status === 404) {
        setEdit(null)
        carregar()
      }
    } finally {
      trava.current = false
      setSalvando(false)
    }
  }

  async function remover(e) {
    if (trava.current) return
    trava.current = true
    setRemovendo(true)
    try {
      await api(`/endpoints/${e.id}`, { method: 'DELETE' })
      notify(`${e.endpoint} removido`)
      setConfirmando(null)
      setLista(l => l?.filter(x => x.id !== e.id) ?? l)
      carregar()
      onChanged?.()
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 404) {
        setConfirmando(null)
        carregar()
      }
    } finally {
      trava.current = false
      setRemovendo(false)
    }
  }

  const header = (
    <PageHeader
      title="Endpoints"
      description="Hosts classificados com criticidade, departamento e tipo"
      actions={
        admin && (
          <button
            type="button"
            onClick={novo}
            disabled={lista === null || !!erro || edit?.id === NOVO}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" strokeWidth={2.4} aria-hidden="true" />
            Novo endpoint
          </button>
        )
      }
    />
  )

  let conteudo
  if (erro) {
    conteudo = (
      <CardErro
        titulo="Não foi possível carregar os endpoints"
        mensagem={erro}
        onRetry={() => {
          setErro(null)
          setLista(null) // volta ao skeleton enquanto tenta
          carregar()
        }}
      />
    )
  } else if (lista === null) {
    conteudo = <EsqueletoEndpoints />
  } else if (lista.length === 0 && edit?.id !== NOVO) {
    conteudo = (
      <EmptyState
        icon={Server}
        title="Nenhum endpoint classificado"
        description="Classifique hosts na aba Não classificados ou adicione um endpoint manualmente."
        action={
          admin && (
            <button
              type="button"
              onClick={novo}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="size-4" aria-hidden="true" />
              Novo endpoint
            </button>
          )
        }
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="search">
          <label className="relative min-w-52 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar por host ou departamento</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar host ou departamento…"
              className="h-8 w-full rounded-lg border border-control bg-bg/40 pr-2.5 pl-8 text-xs text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          <InlineSelect
            value={fCrit}
            onChange={setFCrit}
            options={[{ value: TODOS, label: 'Todas as criticidades' }, ...OPCOES_CRITICIDADE]}
            aria-label="Filtrar por criticidade"
            className="w-44"
          />
          <InlineSelect
            value={fDep}
            onChange={setFDep}
            options={[{ value: TODOS, label: 'Todos os departamentos' }, ...departamentos]}
            aria-label="Filtrar por departamento"
            className="w-48"
          />
          <InlineSelect
            value={fTipo}
            onChange={setFTipo}
            options={[{ value: TODOS, label: 'Todos os tipos' }, ...tipos]}
            aria-label="Filtrar por tipo"
            className="w-40"
          />
          {filtroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex h-8 animate-fade-in items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent-soft transition-colors hover:bg-accent/10"
            >
              <FilterX className="size-3.5" aria-hidden="true" />
              Limpar
            </button>
          )}
          <span className="ml-auto text-xs text-muted tabular-nums" aria-live="polite">
            {filtroAtivo
              ? `${filtrados.length.toLocaleString('pt-BR')} de ${lista.length.toLocaleString('pt-BR')}`
              : `${lista.length.toLocaleString('pt-BR')} ${lista.length === 1 ? 'endpoint' : 'endpoints'}`}
          </span>
        </div>

        <div className="animate-fade-in overflow-x-auto rounded-2xl border border-border bg-surface shadow-xl shadow-black/20">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[16%]" />
              <col className="w-[19%]" />
              <col className="w-[17%]" />
              {admin && <col className="w-[132px]" />}
            </colgroup>
            <thead>
              <tr className="text-[11px] font-medium tracking-wider text-subtle uppercase">
                <th scope="col" className="px-5 py-2.5 font-medium">Host</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Criticidade</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Departamento</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Tipo</th>
                {admin && <th scope="col" className="px-5 py-2.5 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {edit?.id === NOVO && (
                <LinhaEdicao
                  edit={edit}
                  setEdit={setEdit}
                  salvando={salvando}
                  onSalvar={salvar}
                  onCancelar={cancelar}
                  departamentos={departamentos}
                  tipos={tipos}
                />
              )}
              {filtrados.map(e =>
                edit?.id === e.id ? (
                  <LinhaEdicao
                    key={e.id}
                    edit={edit}
                    setEdit={setEdit}
                    salvando={salvando}
                    onSalvar={salvar}
                    onCancelar={cancelar}
                    departamentos={departamentos}
                    tipos={tipos}
                  />
                ) : (
                  <LinhaLeitura
                    key={e.id}
                    e={e}
                    admin={admin}
                    destaque={destaque === e.id}
                    confirmando={confirmando === e.id}
                    removendo={removendo && confirmando === e.id}
                    bloqueado={salvando || removendo}
                    onEditar={() => editar(e)}
                    onPedirRemover={() => {
                      setEdit(null)
                      setConfirmando(e.id)
                    }}
                    onRemover={() => remover(e)}
                    onCancelarRemover={() => setConfirmando(null)}
                  />
                )
              )}
              {filtrados.length === 0 && edit?.id !== NOVO && (
                <tr className="border-t border-border">
                  <td colSpan={admin ? 5 : 4} className="px-5 py-12 text-center">
                    <p className="text-sm text-muted">Nenhum endpoint corresponde aos filtros.</p>
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-control px-3 text-xs font-medium text-fg transition-colors hover:bg-white/5"
                    >
                      <FilterX className="size-3.5" aria-hidden="true" />
                      Limpar filtros
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <StatCards stats={stats} />
      {conteudo}
    </div>
  )
}
