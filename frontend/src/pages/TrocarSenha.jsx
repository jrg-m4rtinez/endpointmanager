import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import { api } from '../api.js'
import { botaoPrimario, CampoSenha, TelaCentral } from '../components/TelaCentral.jsx'
import { useToast } from '../components/Toast.jsx'

const MINIMO = 12

function Requisito({ ok, children }) {
  return (
    <li className={`flex items-center gap-1.5 transition-colors ${ok ? 'text-success' : 'text-subtle'}`}>
      <span
        className={`grid size-3.5 place-items-center rounded-full border transition-colors ${
          ok ? 'border-success/50 bg-success/15' : 'border-control'
        }`}
        aria-hidden="true"
      >
        {ok && <Check className="size-2.5" strokeWidth={3} />}
      </span>
      {children}
      <span className="sr-only">{ok ? ' (atendido)' : ' (pendente)'}</span>
    </li>
  )
}

/**
 * Troca obrigatória da senha temporária (usuário local com trocarSenha).
 * Props: user, onConcluido() — o App recarrega /auth/me —, onLogout.
 */
export default function TrocarSenha({ user, onConcluido, onLogout }) {
  const { notify } = useToast()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null) // { campo: 'atual'|'nova'|'confirmacao'|null, texto }

  const trava = useRef(false)
  const refs = { atual: useRef(null), nova: useRef(null), confirmacao: useRef(null) }

  useEffect(() => {
    refs.atual.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tamanhoOk = nova.length >= MINIMO
  const confereOk = confirmacao.length > 0 && confirmacao === nova

  function falhar(campo, texto) {
    setErro({ campo, texto })
    if (campo) requestAnimationFrame(() => refs[campo].current?.focus())
  }

  async function salvar(e) {
    e.preventDefault()
    if (trava.current) return
    if (!atual) return falhar('atual', 'Informe a senha atual (a temporária que você recebeu).')
    if (!tamanhoOk) return falhar('nova', `A nova senha precisa ter pelo menos ${MINIMO} caracteres.`)
    if (nova === atual) return falhar('nova', 'A nova senha deve ser diferente da atual.')
    if (!confereOk) return falhar('confirmacao', 'A confirmação não é igual à nova senha.')

    trava.current = true
    setEnviando(true)
    setErro(null)
    try {
      await api('/auth/local/senha', { method: 'POST', body: { senhaAtual: atual, novaSenha: nova } })
      setAtual('')
      setNova('')
      setConfirmacao('')
      notify('Senha alterada. Bem-vindo!')
      await onConcluido?.()
    } catch (err) {
      if (err.code === 'senha_atual_incorreta') {
        setAtual('')
        falhar('atual', err.message)
      } else if (err.status === 400 && err.code !== 'usuario_sso') {
        falhar('nova', err.message) // frase pt-BR do backend (tamanho, igual à atual…)
      } else {
        falhar(null, err.message)
      }
    } finally {
      trava.current = false
      setEnviando(false)
    }
  }

  const invalido = campo => erro?.campo === campo

  return (
    <TelaCentral className="max-w-md" aria-labelledby="titulo-trocar">
      <div className="flex flex-col items-center text-center">
        <div className="grid size-12 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent-soft">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <h1 id="titulo-trocar" className="mt-4 text-lg font-semibold tracking-tight">Crie sua senha</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Você entrou com uma senha temporária. Defina uma senha pessoal para continuar.
        </p>
        {user?.email && (
          <p className="mt-3 inline-flex rounded-full border border-control bg-bg/60 px-3 py-1 font-mono text-xs text-muted">
            {user.email}
          </p>
        )}
      </div>

      <form onSubmit={salvar} noValidate className="mt-6 flex flex-col gap-4">
        {/* Ajuda gerenciadores de senha a associar a nova senha à conta certa. */}
        <input type="email" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />

        <CampoSenha
          ref={refs.atual}
          id="senha-atual"
          rotulo="Senha atual"
          icone={LockKeyhole}
          autoComplete="current-password"
          value={atual}
          onChange={e => setAtual(e.target.value)}
          readOnly={enviando}
          invalido={invalido('atual')}
        />
        <CampoSenha
          ref={refs.nova}
          id="senha-nova"
          rotulo="Nova senha"
          icone={ShieldCheck}
          autoComplete="new-password"
          value={nova}
          onChange={e => setNova(e.target.value)}
          readOnly={enviando}
          invalido={invalido('nova')}
          dica={
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Requisito ok={tamanhoOk}>
                mínimo {MINIMO} caracteres
                {nova.length > 0 && !tamanhoOk && <span className="tabular-nums"> ({nova.length}/{MINIMO})</span>}
              </Requisito>
            </ul>
          }
        />
        <CampoSenha
          ref={refs.confirmacao}
          id="senha-confirmacao"
          rotulo="Confirme a nova senha"
          icone={ShieldCheck}
          autoComplete="new-password"
          value={confirmacao}
          onChange={e => setConfirmacao(e.target.value)}
          readOnly={enviando}
          invalido={invalido('confirmacao')}
          dica={
            <ul className="flex text-xs">
              <Requisito ok={confereOk}>igual à nova senha</Requisito>
            </ul>
          }
        />

        <div aria-live="assertive" aria-atomic="true" className="empty:-mt-4">
          {erro && (
            <p className="flex animate-fade-in items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2 text-left text-sm leading-snug text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {erro.texto}
            </p>
          )}
        </div>

        <button type="submit" disabled={enviando} className={botaoPrimario}>
          {enviando ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            <>
              <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />
              Salvar e continuar
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onLogout}
          disabled={enviando}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </button>
      </form>
    </TelaCentral>
  )
}
