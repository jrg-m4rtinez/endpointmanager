import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Copy,
  Hourglass,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcwKey,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import InlineSelect from '../components/InlineSelect.jsx'
import CardErro from '../components/CardErro.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { iniciais } from '../components/Sidebar.jsx'
import { LogoMicrosoft } from '../components/TelaCentral.jsx'
import { useToast } from '../components/Toast.jsx'

const PAPEIS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'leitor', label: 'Leitor' },
  { value: 'admin', label: 'Admin' },
]
const PAPEIS_NOVO = PAPEIS.filter(p => p.value !== 'pendente')
const ROTULO = Object.fromEntries(PAPEIS.map(p => [p.value, p.label]))
const DESTAQUE_MS = 1800
const COPIADO_MS = 2000

const btnIcone =
  'grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'
const btnSalvar =
  'grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-control disabled:text-subtle disabled:shadow-none'
const inputBase =
  'h-8 w-full min-w-0 rounded-lg border bg-bg/60 px-2.5 text-sm text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40 read-only:opacity-60'

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

function ChipOrigem({ origem }) {
  if (origem === 'local') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-soft">
        <KeyRound className="size-3" aria-hidden="true" />
        Local
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-control bg-bg/60 px-2 py-0.5 text-[11px] font-medium text-muted">
      <LogoMicrosoft className="size-2.5" />
      Microsoft
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
          <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.04]" />
          <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
          <div className="ml-auto h-8 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        </>
      )}
    </Esqueleto>
  )
}

function Linha({ u, eu, salvando, destaque, confirmando, bloqueado, onPapel, onPedirRedefinir }) {
  const pendente = u.papel === 'pendente'
  const nome = u.nome || u.email
  let fundo = 'hover:bg-surface-hover/60'
  if (confirmando) fundo = 'bg-warning/[0.05]'
  else if (destaque) fundo = 'bg-accent/[0.12]'
  else if (pendente) fundo = 'bg-accent/[0.06] shadow-[inset_2px_0_0] shadow-accent hover:bg-accent/[0.09]'
  return (
    <tr className={`border-t border-border transition-colors duration-500 ${fundo}`}>
      <td className="px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={nome} pendente={pendente} />
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
      <td className="px-3 py-3">
        <ChipOrigem origem={u.origem} />
      </td>
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
                <span className="sr-only" role="status">Salvando…</span>
              </>
            )}
          </span>
          {u.origem === 'local' && !eu ? (
            <button
              type="button"
              onClick={() => onPedirRedefinir(u)}
              disabled={bloqueado || salvando}
              aria-label={`Redefinir senha de ${nome}`}
              aria-expanded={confirmando}
              title="Redefinir senha"
              className={`${btnIcone} ${confirmando ? 'bg-warning/10 text-warning' : 'hover:bg-warning/10 hover:text-warning'}`}
            >
              <RotateCcwKey className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <span className="size-8 shrink-0" aria-hidden="true" />
          )}
          <InlineSelect
            value={u.papel}
            onChange={v => onPapel(u, v)}
            options={PAPEIS}
            aria-label={`Papel de ${nome}`}
            disabled={salvando}
            className="w-32"
          />
        </div>
      </td>
    </tr>
  )
}

function ConfirmarRedefinir({ u, ocupado, onConfirmar, onCancelar }) {
  const nome = u.nome || u.email
  return (
    <tr className="bg-warning/[0.05]">
      <td colSpan={5} className="px-5 pt-0 pb-3">
        <div
          className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning/[0.07] px-3.5 py-2.5"
          onKeyDown={e => e.key === 'Escape' && onCancelar()}
          role="group"
          aria-label={`Confirmar redefinição de senha de ${nome}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-warning/30 bg-warning/10 text-warning">
            <TriangleAlert className="size-4" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-sm leading-snug text-fg">
            Gerar uma nova senha temporária para <span className="font-semibold">{nome}</span>?{' '}
            <span className="text-muted">A senha atual deixa de funcionar e a pessoa cria outra no próximo login.</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onConfirmar}
              disabled={ocupado}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-warning/90 px-2.5 text-xs font-semibold text-bg transition-colors hover:bg-warning disabled:opacity-60"
            >
              {ocupado && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
              Sim, redefinir
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
        </div>
      </td>
    </tr>
  )
}

function FormNovo({ novo, setNovo, criando, erro, onCriar, onCancelar, nomeRef, emailRef }) {
  const pronto = novo.nome.trim() !== '' && novo.email.trim() !== ''
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onCriar()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancelar()
        }
      }}
      aria-labelledby="novo-local-titulo"
      noValidate
      className="flex animate-fade-in flex-col gap-2.5 rounded-2xl border border-accent/40 bg-accent/[0.06] p-3 shadow-[0_0_0_3px] shadow-accent/10"
    >
      <div className="flex items-center gap-2 px-1">
        <UserPlus className="size-4 text-accent-soft" aria-hidden="true" />
        <h2 id="novo-local-titulo" className="text-sm font-semibold text-fg">Novo usuário local</h2>
        <span className="hidden text-xs text-muted sm:inline">· entra com e-mail e senha; uma senha temporária será gerada.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-44 flex-[1.2]">
          <span className="sr-only">Nome</span>
          <input
            ref={nomeRef}
            type="text"
            value={novo.nome}
            onChange={e => setNovo(s => ({ ...s, nome: e.target.value }))}
            placeholder="Nome completo"
            autoComplete="off"
            maxLength={120}
            readOnly={criando}
            className={`${inputBase} border-control`}
          />
        </label>
        <label className="min-w-52 flex-[1.4]">
          <span className="sr-only">E-mail</span>
          <input
            ref={emailRef}
            type="email"
            inputMode="email"
            value={novo.email}
            onChange={e => setNovo(s => ({ ...s, email: e.target.value }))}
            placeholder="pessoa@empresa.com"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={254}
            readOnly={criando}
            aria-invalid={erro?.campo === 'email' || undefined}
            aria-describedby={erro ? 'novo-local-erro' : undefined}
            className={`${inputBase} font-mono text-[13px] ${erro?.campo === 'email' ? 'border-danger/60' : 'border-control'}`}
          />
        </label>
        <InlineSelect
          value={novo.papel}
          onChange={v => setNovo(s => ({ ...s, papel: v }))}
          options={PAPEIS_NOVO}
          aria-label="Papel do novo usuário"
          disabled={criando}
          className="w-28"
        />
        <div className="flex items-center gap-1">
          <button type="submit" disabled={!pronto || criando} aria-label="Criar usuário local" title="Criar (Enter)" className={btnSalvar}>
            {criando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />
            )}
          </button>
          <button type="button" onClick={onCancelar} disabled={criando} aria-label="Cancelar novo usuário" title="Cancelar (Esc)" className={btnIcone}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div aria-live="assertive" aria-atomic="true" className="empty:hidden">
        {erro && (
          <p id="novo-local-erro" className="flex items-center gap-1.5 px-1 text-xs text-danger">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {erro.texto}
          </p>
        )}
      </div>
    </form>
  )
}

/** Painel com a senha temporária. Só em estado React: some ao fechar ou sair da página. */
function PainelSenha({ painel, onFechar }) {
  const { notify } = useToast()
  const [copiado, setCopiado] = useState(false)
  const copiarRef = useRef(null)
  const senhaRef = useRef(null)

  useEffect(() => {
    copiarRef.current?.focus()
    setCopiado(false)
  }, [painel])

  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), COPIADO_MS)
    return () => clearTimeout(t)
  }, [copiado])

  function selecionar() {
    const el = senhaRef.current
    if (!el) return
    const r = document.createRange()
    r.selectNodeContents(el)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(painel.senha)
      setCopiado(true)
    } catch {
      selecionar()
      notify('Não foi possível copiar. A senha foi selecionada: use Ctrl+C.', 'error')
    }
  }

  const nome = painel.nome || painel.email
  return (
    <section
      aria-labelledby="painel-senha-titulo"
      className="relative animate-fade-in overflow-hidden rounded-2xl border border-accent/45 bg-gradient-to-br from-accent/[0.16] via-surface to-surface p-5 shadow-xl shadow-accent/10"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-soft/70 text-white shadow-lg shadow-accent/30">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="painel-senha-titulo" className="text-sm font-semibold text-fg">
              {painel.tipo === 'criado' ? `Usuário ${nome} criado` : `Senha de ${nome} redefinida`}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Senha temporária para <span className="font-mono text-[12.5px] text-fg/90">{painel.email}</span>
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar painel da senha" title="Fechar" className={btnIcone}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code
            ref={senhaRef}
            aria-label="Senha temporária"
            className="min-w-0 flex-1 rounded-xl border border-control bg-bg/80 px-4 py-3 font-mono text-lg font-medium tracking-[0.18em] break-all text-fg select-all"
          >
            {painel.senha}
          </code>
          <button
            ref={copiarRef}
            type="button"
            onClick={copiar}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all active:scale-95 ${
              copiado
                ? 'border border-success/40 bg-success/15 text-success'
                : 'bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent-hover'
            }`}
          >
            {copiado ? <Check className="size-4" strokeWidth={2.6} aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <span className="sr-only" role="status">{copiado ? 'Senha copiada para a área de transferência' : ''}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-start gap-2 text-sm leading-snug">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <span className="font-semibold text-warning">Anote agora: esta senha não será mostrada de novo.</span>{' '}
              <span className="text-muted">Envie por um canal seguro; no primeiro login a pessoa cria uma senha própria.</span>
            </span>
          </p>
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-control px-3.5 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface-hover"
          >
            Fechar
          </button>
        </div>
      </div>
    </section>
  )
}

const NOVO_VAZIO = { nome: '', email: '', papel: 'leitor' }

export default function Acessos({ user, onSessao }) {
  const { notify } = useToast()
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const [recarregando, setRecarregando] = useState(false)
  const [salvando, setSalvando] = useState(() => new Set())
  const [local, setLocal] = useState(false) // GET /auth/config
  const [novo, setNovo] = useState(null) // { nome, email, papel } quando o formulário está aberto
  const [criando, setCriando] = useState(false)
  const [erroNovo, setErroNovo] = useState(null) // { campo, texto }
  const [confirmando, setConfirmando] = useState(null) // id do usuário em "Redefinir senha?"
  const [redefinindo, setRedefinindo] = useState(false)
  const [painel, setPainel] = useState(null) // { tipo, nome, email, senha } — nunca em storage
  const [destaque, setDestaque] = useState(null)

  const seq = useRef(0)
  const travas = useRef(new Set()) // guarda síncrona por usuário contra duplo envio
  const travaAcao = useRef(false) // criar / redefinir
  const nomeRef = useRef(null)
  const emailRef = useRef(null)
  const novoBtnRef = useRef(null)

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

  useEffect(() => {
    let vivo = true
    api('/auth/config')
      .then(c => vivo && setLocal(Boolean(c?.local)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (destaque === null) return
    const t = setTimeout(() => setDestaque(null), DESTAQUE_MS)
    return () => clearTimeout(t)
  }, [destaque])

  useEffect(() => {
    if (novo !== null) nomeRef.current?.focus()
  }, [novo !== null]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function abrirNovo() {
    if (travaAcao.current) return
    setConfirmando(null)
    setErroNovo(null)
    setNovo(n => n ?? NOVO_VAZIO)
  }

  function fecharNovo() {
    if (travaAcao.current) return
    setNovo(null)
    setErroNovo(null)
    requestAnimationFrame(() => novoBtnRef.current?.focus())
  }

  async function criar() {
    if (!novo || travaAcao.current) return
    const nome = novo.nome.trim()
    const email = novo.email.trim()
    if (!nome || !email) return
    travaAcao.current = true
    setCriando(true)
    setErroNovo(null)
    try {
      const r = await api('/usuarios', { method: 'POST', body: { nome, email, papel: novo.papel } })
      const criado = r?.usuario || { nome, email }
      setNovo(null)
      setPainel({ tipo: 'criado', nome: criado.nome, email: criado.email, senha: r?.senhaTemporaria })
      setDestaque(criado.id ?? null)
      notify(`Usuário local ${criado.nome || criado.email} criado`)
      carregar()
    } catch (err) {
      if (err.code === 'login_local_desligado') {
        setLocal(false)
        setNovo(null)
        notify(err.message, 'error')
      } else if (err.code === 'email_em_uso') {
        setErroNovo({ campo: 'email', texto: err.message })
        requestAnimationFrame(() => emailRef.current?.focus())
      } else {
        setErroNovo({ campo: null, texto: err.message })
      }
    } finally {
      travaAcao.current = false
      setCriando(false)
    }
  }

  function pedirRedefinir(u) {
    if (travaAcao.current) return
    setConfirmando(c => (c === u.id ? null : u.id))
  }

  function cancelarRedefinir() {
    if (travaAcao.current) return
    setConfirmando(null)
  }

  async function redefinir(u) {
    if (travaAcao.current) return
    travaAcao.current = true
    setRedefinindo(true)
    try {
      const r = await api(`/usuarios/${u.id}/redefinir-senha`, { method: 'POST' })
      setConfirmando(null)
      setPainel({ tipo: 'redefinido', nome: u.nome, email: u.email, senha: r?.senhaTemporaria })
      setDestaque(u.id)
    } catch (err) {
      notify(err.message, 'error')
      if (err.status === 404 || err.code === 'usuario_sso') {
        setConfirmando(null)
        carregar()
      }
    } finally {
      travaAcao.current = false
      setRedefinindo(false)
    }
  }

  const fecharPainel = () => setPainel(null) // descarta a senha da memória do componente

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
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[27%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[230px]" />
            </colgroup>
            <thead>
              <tr className="text-[11px] font-medium tracking-wider text-subtle uppercase">
                <th scope="col" className="px-5 py-2.5 font-medium">Usuário</th>
                <th scope="col" className="px-3 py-2.5 font-medium">E-mail</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Origem</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Último login</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Papel</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(u => {
                const emConfirmacao = confirmando === u.id
                return (
                  <Fragment key={u.id}>
                    <Linha
                      u={u}
                      eu={u.id === user?.id}
                      salvando={salvando.has(u.id)}
                      destaque={destaque === u.id}
                      confirmando={emConfirmacao}
                      bloqueado={criando || redefinindo}
                      onPapel={mudarPapel}
                      onPedirRedefinir={pedirRedefinir}
                    />
                    {emConfirmacao && (
                      <ConfirmarRedefinir
                        u={u}
                        ocupado={redefinindo}
                        onConfirmar={() => redefinir(u)}
                        onCancelar={cancelarRedefinir}
                      />
                    )}
                  </Fragment>
                )
              })}
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
          <>
            {local && (
              <button
                ref={novoBtnRef}
                type="button"
                onClick={abrirNovo}
                disabled={novo !== null}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-default disabled:opacity-50"
              >
                <Plus className="size-4" strokeWidth={2.4} aria-hidden="true" />
                Novo usuário local
              </button>
            )}
            <button
              type="button"
              onClick={carregar}
              disabled={recarregando}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-control bg-surface px-3.5 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${recarregando ? 'animate-spin' : ''}`} aria-hidden="true" />
              Atualizar
            </button>
          </>
        }
      />
      {painel && <PainelSenha painel={painel} onFechar={fecharPainel} />}
      {novo && local && (
        <FormNovo
          novo={novo}
          setNovo={setNovo}
          criando={criando}
          erro={erroNovo}
          onCriar={criar}
          onCancelar={fecharNovo}
          nomeRef={nomeRef}
          emailRef={emailRef}
        />
      )}
      {conteudo}
    </div>
  )
}
