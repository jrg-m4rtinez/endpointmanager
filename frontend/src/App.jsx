import { useCallback, useEffect, useRef, useState } from 'react'
import { Hexagon, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, EVENTO_SESSAO_EXPIRADA, EVENTO_TROCAR_SENHA, logout } from './api.js'
import Sidebar, { abasVisiveis } from './components/Sidebar.jsx'
import { TelaCentral } from './components/TelaCentral.jsx'
import { ToastProvider, useToast } from './components/Toast.jsx'
import AguardandoLiberacao from './pages/AguardandoLiberacao.jsx'
import Login from './pages/Login.jsx'
import TrocarSenha from './pages/TrocarSenha.jsx'
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

const AVISO_EXPIROU = { tipo: 'info', texto: 'Sua sessão expirou. Entre novamente para continuar.' }
const AVISO_FALHA_MS = { tipo: 'erro', texto: 'Falha no login com a Microsoft. Tente novamente ou fale com um administrador.' }

/** Lê e remove ?erro=login da URL (o callback OIDC redireciona para /?erro=login). */
function consumirErroLogin() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('erro') !== 'login') return false
  params.delete('erro')
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
  return true
}

function Raiz() {
  const [erroLogin] = useState(consumirErroLogin)
  const [estado, setEstado] = useState(() =>
    erroLogin ? { tipo: 'login', aviso: AVISO_FALHA_MS } : { tipo: 'carregando' }
  )
  const { notify } = useToast()
  const estadoRef = useRef(estado)
  estadoRef.current = estado
  const seq = useRef(0) // descarta respostas de /auth/me fora de ordem

  const carregarSessao = useCallback(
    ({ silencioso = false } = {}) => {
      const meu = ++seq.current
      return api('/auth/me')
        .then(user => meu === seq.current && setEstado({ tipo: 'pronto', user }))
        .catch(err => {
          if (meu !== seq.current) return
          if (err.status === 401) {
            // No meio do uso o evento 'sessao-expirada' já trocou para o Login com aviso.
            if (estadoRef.current.tipo !== 'login') setEstado({ tipo: 'login', aviso: null })
          } else if (silencioso || estadoRef.current.tipo === 'pronto') {
            notify(err.message, 'error')
          } else {
            setEstado({ tipo: 'erro', mensagem: err.message })
          }
        })
    },
    [notify]
  )

  useEffect(() => {
    if (!erroLogin) carregarSessao()
  }, [erroLogin, carregarSessao])

  useEffect(() => {
    // Só é "expirou" se havia sessão; no bootstrap o 401 de /auth/me cai no catch acima.
    const onExpirada = () => {
      if (estadoRef.current.tipo === 'pronto') {
        seq.current++
        setEstado({ tipo: 'login', aviso: AVISO_EXPIROU })
      }
    }
    const onTrocarSenha = () => {
      if (estadoRef.current.tipo === 'pronto' && !estadoRef.current.user.trocarSenha) carregarSessao()
    }
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, onExpirada)
    window.addEventListener(EVENTO_TROCAR_SENHA, onTrocarSenha)
    return () => {
      window.removeEventListener(EVENTO_SESSAO_EXPIRADA, onExpirada)
      window.removeEventListener(EVENTO_TROCAR_SENHA, onTrocarSenha)
    }
  }, [carregarSessao])

  const sair = () => logout().catch(err => notify(err.message, 'error'))
  const recarregarSessao = useCallback(() => carregarSessao({ silencioso: true }), [carregarSessao])

  switch (estado.tipo) {
    case 'carregando':
      return <Carregando />
    case 'login':
      return <Login aviso={estado.aviso} onEntrou={recarregarSessao} />
    case 'erro':
      return <ErroSessao mensagem={estado.mensagem} />
    default: {
      const { user } = estado
      if (user.trocarSenha) return <TrocarSenha user={user} onConcluido={recarregarSessao} onLogout={sair} />
      if (user.papel === 'pendente') return <AguardandoLiberacao user={user} onLogout={sair} />
      return <Shell user={user} onSessao={recarregarSessao} />
    }
  }
}

export default function App() {
  return (
    <ToastProvider>
      <Raiz />
    </ToastProvider>
  )
}
