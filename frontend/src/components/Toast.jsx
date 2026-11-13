import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

const ToastContext = createContext(null)
const DURACAO_MS = 4500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback(id => {
    setToasts(ts => ts.filter(t => t.id !== id))
  }, [])

  const notify = useCallback((msg, type = 'success') => {
    const id = ++seq.current
    setToasts(ts => [...ts.slice(-3), { id, msg, type }])
    setTimeout(() => dismiss(id), type === 'error' ? DURACAO_MS + 2000 : DURACAO_MS)
  }, [dismiss])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }) {
  const erro = toast.type === 'error'
  const Icon = erro ? CircleAlert : CircleCheck
  return (
    <div
      role={erro ? 'alert' : 'status'}
      className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border bg-surface/95 px-4 py-3 text-sm shadow-2xl shadow-black/50 backdrop-blur ${
        erro ? 'border-danger/30' : 'border-success/25'
      }`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${erro ? 'text-danger' : 'text-success'}`} aria-hidden="true" />
      <p className="flex-1 leading-snug text-fg">{toast.msg}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar notificação"
        className="-m-1 rounded-md p-1 text-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
