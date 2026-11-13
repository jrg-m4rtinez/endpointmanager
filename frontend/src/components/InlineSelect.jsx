import { ChevronDown } from 'lucide-react'

/**
 * Select compacto para edição na linha.
 * onChange recebe o `value` original da opção (preserva número/string).
 */
export default function InlineSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Selecionar',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  const atual = value === null || value === undefined ? '' : String(value)
  const vazio = atual === ''

  function handleChange(e) {
    const opt = options.find(o => String(o.value) === e.target.value)
    onChange?.(opt ? opt.value : null)
  }

  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        value={atual}
        onChange={handleChange}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        className={`h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-control bg-bg/40 pr-7 pl-2.5 text-xs font-medium transition-colors outline-none hover:border-subtle hover:bg-surface-hover focus-visible:border-accent-soft focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
          vazio ? 'text-muted' : 'text-fg'
        }`}
        {...rest}
      >
        <option value="" disabled hidden>{placeholder}</option>
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)} className="bg-surface text-fg">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  )
}
