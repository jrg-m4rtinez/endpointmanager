import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Info, LoaderCircle, LockKeyhole, LogIn, Mail, TriangleAlert } from 'lucide-react'
import { api } from '../api.js'
import { botaoPrimario, Campo, CampoSenha, LogoMicrosoft, Marca, TelaCentral } from '../components/TelaCentral.jsx'

const ERRO_CREDENCIAIS = 'E-mail ou senha inválidos.'

/**
 * Tela de entrada. SSO é um link simples (sem redirecionar sozinho).
 * O formulário de e-mail e senha só aparece se GET /auth/config disser { local: true }.
 * Props: aviso ({ tipo: 'info'|'erro', texto }), onEntrou() — o App recarrega /auth/me.
 */
export default function Login({ aviso, onEntrou }) {
  const [local, setLocal] = useState(null) // null = carregando /auth/config
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null)

  const trava = useRef(false) // guarda síncrona contra duplo envio
  const emailRef = useRef(null)
  const senhaRef = useRef(null)

  useEffect(() => {
    let vivo = true
    api('/auth/config')
      .then(c => vivo && setLocal(Boolean(c?.local)))
      .catch(() => vivo && setLocal(false)) // sem config: oferece só a Microsoft
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (local) emailRef.current?.focus()
  }, [local])

  async function entrar(e) {
    e.preventDefault()
    if (trava.current) return
    const em = email.trim()
    if (!em || !senha) {
      setErro('Informe e-mail e senha.')
      ;(em ? senhaRef : emailRef).current?.focus()
      return
    }
    trava.current = true
    setEnviando(true)
    setErro(null)
    try {
      await api('/auth/local/login', { method: 'POST', body: { email: em, senha } })
      setSenha('')
      await onEntrou?.()
    } catch (err) {
      setSenha('')
      if (err.status === 404) {
        setLocal(false) // login local foi desligado no servidor
        setErro(null)
      } else {
        setErro(err.status === 401 ? ERRO_CREDENCIAIS : err.message)
        requestAnimationFrame(() => senhaRef.current?.focus())
      }
    } finally {
      trava.current = false
      setEnviando(false)
    }
  }

  const AvisoIcone = aviso?.tipo === 'erro' ? TriangleAlert : Info

  return (
    <TelaCentral className="max-w-sm" aria-labelledby="titulo-login">
      <Marca subtitulo="Entre para gerenciar os endpoints" />
      <h1 id="titulo-login" className="sr-only">Entrar no Endpoint Manager</h1>

      {aviso && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm leading-snug ${
            aviso.tipo === 'erro'
              ? 'border-danger/30 bg-danger/[0.08] text-danger'
              : 'border-warning/30 bg-warning/[0.08] text-warning'
          }`}
        >
          <AvisoIcone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{aviso.texto}</span>
        </div>
      )}

      <a
        href="/api/auth/login"
        className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-control bg-bg/60 px-4 text-sm font-medium text-fg transition-all hover:border-subtle hover:bg-surface-hover active:scale-[0.99]"
      >
        <LogoMicrosoft />
        Entrar com Microsoft
      </a>

      {local === null && (
        <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
          <div className="mx-auto h-3 w-8 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
          <div className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
        </div>
      )}

      {local && (
        <div className="animate-fade-in">
          <div className="my-6 flex items-center gap-3 text-[11px] font-medium tracking-wider text-subtle uppercase" aria-hidden="true">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
            ou
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
          </div>

          <form onSubmit={entrar} noValidate aria-label="Entrar com e-mail e senha" className="flex flex-col gap-4">
            <Campo
              ref={emailRef}
              id="login-email"
              rotulo="E-mail"
              icone={Mail}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="voce@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              readOnly={enviando}
              invalido={Boolean(erro)}
              maxLength={254}
            />
            <CampoSenha
              ref={senhaRef}
              id="login-senha"
              rotulo="Senha"
              icone={LockKeyhole}
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              readOnly={enviando}
              invalido={Boolean(erro)}
            />

            <div aria-live="assertive" aria-atomic="true" className="empty:-mt-4">
              {erro && (
                <p className="flex animate-fade-in items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2 text-left text-sm leading-snug text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {erro}
                </p>
              )}
            </div>

            <button type="submit" disabled={enviando} className={botaoPrimario}>
              {enviando ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Entrando…
                </>
              ) : (
                <>
                  <LogIn className="size-4" aria-hidden="true" />
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
        Problemas para entrar? Fale com um administrador.
      </p>
    </TelaCentral>
  )
}
