import { useCallback, useEffect, useState } from 'react'
import { Hexagon, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, logout } from './api.js'
import Sidebar, { abasVisiveis } from './components/Sidebar.jsx'
import { ToastProvider, useToast } from './components/Toast.jsx'
import AguardandoLiberacao from './pages/AguardandoLiberacao.jsx'
import NaoClassificados from './pages/NaoClassificados.jsx'
import Endpoints from './pages/Endpoints.jsx'
import Departamentos from './pages/Departamentos.jsx'
import Tipos from './pages/Tipos.jsx'
import Acessos from './pages/Acessos.jsx'

const ABA_PADRAO = 'nao-classificados'
const HEALTH_INTERVALO_MS = 60_000

function abaDoHash(user) {
  const id = window.location.hash.replace(/^#/, '')
  return abasVisiveis(user).some(a => a.id === id) ? id : ABA_PADRAO
}

/* ---------- Telas fora do shell ---------- */

function TelaCentral({ children }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
      />
      <section className="relative w-full max-w-md animate-fade-in rounded-2xl border border-border bg-surface/90 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur">
        {children}
      </section>
    </main>
  )
}

function Carregando() {
  return (
    <main className="grid min-h-screen place-items-center" aria-busy="true">
      <div className="flex flex-col items-center gap-4 text-muted">
        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-soft/70 shadow-lg shadow-accent/25">
          <Hexagon className="size-5 text-white" strokeWidth={2.4} aria-hidden="true" />
        </div>
        <span className="inline-flex items-center gap-2 text-sm" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Carregando sessão…
        </span>
      </div>
    </main>
  )
}

function FalhaLogin() {
  return (
    <TelaCentral>
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Falha no login</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Não foi possível concluir a autenticação. Tente novamente; se o problema continuar, fale com um administrador.
      </p>
      <a
        href="/api/auth/login"
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Tentar novamente
      </a>
    </TelaCentral>
  )
}

function ErroSessao({ mensagem }) {
  return (
    <TelaCentral>
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-warning/30 bg-warning/10 text-warning">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Não foi possível carregar a sessão</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{mensagem}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </TelaCentral>
  )
}

/* ---------- Shell ---------- */

// Cada página tem header próprio. StatCards só em Endpoints e Não classificados (spec §8).
// onChanged = refreshStats: uma única fonte de /stats para o badge e os cards.
// onSessao recarrega /auth/me (ex.: admin que rebaixou o próprio papel).
const PAGINAS = {
  endpoints: Endpoints,
  'nao-classificados': NaoClassificados,
  departamentos: Departamentos,
  tipos: Tipos,
  acessos: Acessos,
}

function Shell({ user, onSessao }) {
  const { notify } = useToast()
  const [aba, setAba] = useState(() => abaDoHash(user))
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const onHash = () => setAba(abaDoHash(user))
    window.addEventListener('hashchange', onHash)
    // Normaliza o hash ao montar e quando o papel muda (aba que deixou de ser visível → padrão).
    const atual = abaDoHash(user)
    setAba(atual)
    if (window.location.hash !== `#${atual}`) window.history.replaceState(null, '', `#${atual}`)
    return () => window.removeEventListener('hashchange', onHash)
  }, [user])

  useEffect(() => {
    let vivo = true
    const carregar = () =>
      api('/health')
        .then(h => vivo && setHealth(h))
        .catch(() => vivo && setHealth({ db: 'erro', defectdojo: 'erro' }))
    carregar()
    const t = setInterval(carregar, HEALTH_INTERVALO_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  const refreshStats = useCallback(() => {
    return api('/stats')
      .then(setStats)
      .catch(err => notify(err.message, 'error'))
  }, [notify])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  const trocarAba = id => {
    window.location.hash = id
  }

  const sair = () => logout().catch(err => notify(err.message, 'error'))

  const Pagina = PAGINAS[aba]

  return (
    <div className="flex min-h-screen">
      <Sidebar
        aba={aba}
        onChange={trocarAba}
        user={user}
        health={health}
        onLogout={sair}
        pendentes={stats?.pendentes}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-7 lg:px-10">
          <div key={aba} className="animate-fade-in">
            <Pagina user={user} stats={stats} onChanged={refreshStats} onSessao={onSessao} />
          </div>
        </div>
      </main>
    </div>
  )
}

/* ---------- Bootstrap da sessão ---------- */

function Raiz() {
  const erroLogin = new URLSearchParams(window.location.search).get('erro') === 'login'
  const [estado, setEstado] = useState(erroLogin ? { tipo: 'erro_login' } : { tipo: 'carregando' })
  const { notify } = useToast()

  useEffect(() => {
    if (erroLogin) return
    api('/auth/me')
      .then(user => setEstado({ tipo: 'pronto', user }))
      .catch(err => setEstado({ tipo: 'erro', mensagem: err.message }))
  }, [erroLogin])

  const sair = () => logout().catch(err => notify(err.message, 'error'))

  const recarregarSessao = useCallback(
    () =>
      api('/auth/me')
        .then(user => setEstado({ tipo: 'pronto', user }))
        .catch(err => notify(err.message, 'error')),
    [notify]
  )

  switch (estado.tipo) {
    case 'carregando':
      return <Carregando />
    case 'erro_login':
      return <FalhaLogin />
    case 'erro':
      return <ErroSessao mensagem={estado.mensagem} />
    default:
      return estado.user.papel === 'pendente'
        ? <AguardandoLiberacao user={estado.user} onLogout={sair} />
        : <Shell user={estado.user} onSessao={recarregarSessao} />
  }
}

export default function App() {
  return (
    <ToastProvider>
      <Raiz />
    </ToastProvider>
  )
}
