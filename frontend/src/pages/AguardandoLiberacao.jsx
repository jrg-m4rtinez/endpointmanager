import { Hourglass, LogOut, RefreshCw } from 'lucide-react'

export default function AguardandoLiberacao({ user, onLogout }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
      />
      <section className="relative w-full max-w-md animate-fade-in rounded-2xl border border-border bg-surface/90 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent-soft">
          <Hourglass className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Aguardando liberação</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Olá{user?.nome ? `, ${user.nome}` : ''}. Seu acesso foi registrado e precisa ser liberado por um
          administrador antes de você usar o Endpoint Manager.
        </p>
        {user?.email && (
          <p className="mt-4 inline-flex rounded-full border border-control bg-bg/60 px-3 py-1 font-mono text-xs text-muted">
            {user.email}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Verificar novamente
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-control px-4 text-sm font-medium text-fg transition-colors hover:bg-white/5"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </section>
    </main>
  )
}
