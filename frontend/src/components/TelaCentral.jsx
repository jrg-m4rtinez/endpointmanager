import { forwardRef, useState } from 'react'
import { Eye, EyeOff, Hexagon } from 'lucide-react'

/** Fundo escuro com brilho violeta e um card central (Login, Trocar senha, erros de sessão). */
export function TelaCentral({ children, className = 'max-w-md text-center', ...rest }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.035)_1px,transparent_0)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] bg-[size:22px_22px]"
        aria-hidden="true"
      />
      <section
        className={`relative w-full animate-fade-in rounded-2xl border border-border bg-surface/90 p-8 shadow-2xl shadow-black/40 backdrop-blur ${className}`}
        {...rest}
      >
        {children}
      </section>
    </main>
  )
}

/** Logo "Endpoint Manager" (hexágono com gradiente). */
export function Marca({ subtitulo }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-soft/70 shadow-lg shadow-accent/30 ring-1 ring-white/10">
        <Hexagon className="size-6 text-white" strokeWidth={2.4} aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-semibold tracking-tight text-fg">Endpoint Manager</p>
      {subtitulo && <p className="mt-1 text-sm text-muted">{subtitulo}</p>}
    </div>
  )
}

/** Ícone de janela da Microsoft (quatro quadrados). */
export function LogoMicrosoft({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export const inputAuth =
  'h-10 w-full min-w-0 rounded-lg border bg-bg/60 pl-9 text-sm text-fg transition-colors outline-none placeholder:text-subtle hover:border-subtle focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60'

export const botaoPrimario =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover active:scale-[0.99] disabled:cursor-wait disabled:opacity-70'

/** Campo com rótulo, ícone à esquerda e erro opcional (marca aria-invalid). */
export const Campo = forwardRef(function Campo({ id, rotulo, icone: Icone, invalido, dica, direita, ...input }, ref) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-xs font-medium text-muted">{rotulo}</label>
      <div className="relative">
        {Icone && (
          <Icone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={invalido || undefined}
          aria-describedby={dica ? `${id}-dica` : undefined}
          className={`${inputAuth} ${direita ? 'pr-10' : 'pr-3'} ${invalido ? 'border-danger/60' : 'border-control'}`}
          {...input}
        />
        {direita}
      </div>
      {dica && <div id={`${id}-dica`}>{dica}</div>}
    </div>
  )
})

/** Campo de senha com botão mostrar/ocultar. */
export const CampoSenha = forwardRef(function CampoSenha(props, ref) {
  const [visivel, setVisivel] = useState(false)
  return (
    <Campo
      ref={ref}
      {...props}
      type={visivel ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="off"
      direita={
        <button
          type="button"
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          aria-controls={props.id}
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg"
        >
          {visivel ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      }
    />
  )
})
