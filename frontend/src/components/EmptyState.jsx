export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center rounded-2xl border border-dashed border-control/70 bg-surface/40 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent-soft">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
