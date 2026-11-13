import React, { useState, useEffect, useCallback } from 'react'

const API = '/api'

const CRITICIDADE = {
  1: { label: 'Baixa',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  2: { label: 'Média',   color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  3: { label: 'Alta',    color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  4: { label: 'Crítica', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido')
  return data
}

function Badge({ criticidade }) {
  const c = CRITICIDADE[criticidade] || CRITICIDADE[1]
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}40`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }}>
      {c.label}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#111318',
        border: '1px solid #2a2d35',
        borderRadius: 12,
        padding: '28px 32px',
        minWidth: 400,
        maxWidth: 480,
        width: '90%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontFamily: 'Syne', fontSize: 18, color: '#f0f0f0' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontFamily: 'JetBrains Mono', letterSpacing: 0.5 }}>{label}</label>}
      <input {...props} style={{
        width: '100%', background: '#0d0f14', border: '1px solid #2a2d35',
        borderRadius: 8, padding: '10px 14px', color: '#f0f0f0',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
        outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.2s',
        ...props.style,
      }}
        onFocus={e => e.target.style.borderColor = '#4f8ef7'}
        onBlur={e => e.target.style.borderColor = '#2a2d35'}
      />
    </div>
  )
}

function Select({ label, children, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontFamily: 'JetBrains Mono', letterSpacing: 0.5 }}>{label}</label>}
      <select {...props} style={{
        width: '100%', background: '#0d0f14', border: '1px solid #2a2d35',
        borderRadius: 8, padding: '10px 14px', color: '#f0f0f0',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
        outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
        ...props.style,
      }}
        onFocus={e => e.target.style.borderColor = '#4f8ef7'}
        onBlur={e => e.target.style.borderColor = '#2a2d35'}
      >
        {children}
      </select>
    </div>
  )
}

function Btn({ variant = 'primary', children, ...props }) {
  const styles = {
    primary: { background: '#4f8ef7', color: '#fff', border: 'none' },
    danger:  { background: 'transparent', color: '#ef4444', border: '1px solid #ef444440' },
    ghost:   { background: 'transparent', color: '#aaa', border: '1px solid #2a2d35' },
  }
  return (
    <button {...props} style={{
      borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
      fontFamily: 'Syne', fontWeight: 600, fontSize: 13,
      transition: 'all 0.15s', ...styles[variant],
      ...(props.style || {}),
    }}>
      {children}
    </button>
  )
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 999,
      background: type === 'error' ? '#3b1212' : '#0f2414',
      border: `1px solid ${type === 'error' ? '#ef4444' : '#22c55e'}40`,
      borderRadius: 10, padding: '12px 20px', color: type === 'error' ? '#ef4444' : '#22c55e',
      fontFamily: 'JetBrains Mono', fontSize: 13,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideIn 0.2s ease',
    }}>
      {msg}
    </div>
  )
}

// ─── Departamentos Tab ────────────────────────────────────────────────────────

function DepartamentosTab({ departamentos, onRefresh, notify }) {
  const [modal, setModal] = useState(null) // null | { mode: 'add'|'edit', item? }
  const [nome, setNome] = useState('')
  const [search, setSearch] = useState('')

  function openAdd() { setNome(''); setModal({ mode: 'add' }) }
  function openEdit(item) { setNome(item.nome); setModal({ mode: 'edit', item }) }
  function closeModal() { setModal(null) }

  async function save() {
    try {
      if (modal.mode === 'add') {
        await apiFetch('/departamentos', { method: 'POST', body: JSON.stringify({ nome }) })
        notify('Departamento criado!', 'success')
      } else {
        await apiFetch(`/departamentos/${modal.item.id}`, { method: 'PUT', body: JSON.stringify({ nome }) })
        notify('Departamento atualizado!', 'success')
      }
      onRefresh(); closeModal()
    } catch (e) { notify(e.message, 'error') }
  }

  async function del(id) {
    if (!confirm('Remover departamento?')) return
    try {
      await apiFetch(`/departamentos/${id}`, { method: 'DELETE' })
      notify('Removido.', 'success'); onRefresh()
    } catch (e) { notify(e.message, 'error') }
  }

  const filtered = departamentos.filter(d => d.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Buscar departamento..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: '#0d0f14', border: '1px solid #2a2d35',
            borderRadius: 8, padding: '10px 14px', color: '#f0f0f0',
            fontFamily: 'JetBrains Mono', fontSize: 13, outline: 'none',
          }}
        />
        <Btn onClick={openAdd}>+ Novo Departamento</Btn>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#555', textAlign: 'center', padding: '40px 0', fontFamily: 'JetBrains Mono' }}>Nenhum departamento encontrado.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(d => (
            <div key={d.id} style={{
              background: '#0d0f14', border: '1px solid #1e2128',
              borderRadius: 10, padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontFamily: 'Syne', fontSize: 15, color: '#f0f0f0', fontWeight: 600 }}>{d.nome}</span>
                <span style={{ marginLeft: 12, fontFamily: 'JetBrains Mono', fontSize: 11, color: '#555' }}>#{d.id}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" onClick={() => openEdit(d)} style={{ padding: '6px 14px', fontSize: 12 }}>Editar</Btn>
                <Btn variant="danger" onClick={() => del(d.id)} style={{ padding: '6px 14px', fontSize: 12 }}>Remover</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Novo Departamento' : 'Editar Departamento'} onClose={closeModal}>
          <Input label="NOME" value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: TI_INFRA" autoFocus
            onKeyDown={e => e.key === 'Enter' && save()} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="ghost" onClick={closeModal}>Cancelar</Btn>
            <Btn onClick={save}>Salvar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Endpoints Tab ────────────────────────────────────────────────────────────

function EndpointsTab({ departamentos, notify }) {
  const [endpoints, setEndpoints] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ endpoint: '', criticidade: 1, departamento_id: '' })
  const [search, setSearch] = useState('')
  const [filterCrit, setFilterCrit] = useState('')
  const [filterDep, setFilterDep] = useState('')

  const load = useCallback(async () => {
    const data = await apiFetch('/endpoints')
    setEndpoints(data)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm({ endpoint: '', criticidade: 1, departamento_id: '' }); setModal({ mode: 'add' }) }
  function openEdit(item) {
    setForm({ endpoint: item.endpoint, criticidade: item.criticidade, departamento_id: item.departamento_id || '' })
    setModal({ mode: 'edit', item })
  }

  async function save() {
    try {
      const payload = { ...form, departamento_id: form.departamento_id || null, criticidade: parseInt(form.criticidade) }
      if (modal.mode === 'add') {
        await apiFetch('/endpoints', { method: 'POST', body: JSON.stringify(payload) })
        notify('Endpoint criado!', 'success')
      } else {
        await apiFetch(`/endpoints/${modal.item.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        notify('Endpoint atualizado!', 'success')
      }
      load(); setModal(null)
    } catch (e) { notify(e.message, 'error') }
  }

  async function del(id) {
    if (!confirm('Remover endpoint?')) return
    try {
      await apiFetch(`/endpoints/${id}`, { method: 'DELETE' })
      notify('Removido.', 'success'); load()
    } catch (e) { notify(e.message, 'error') }
  }

  const filtered = endpoints.filter(e => {
    const matchSearch = e.endpoint.toLowerCase().includes(search.toLowerCase()) ||
      (e.departamento_nome || '').toLowerCase().includes(search.toLowerCase())
    const matchCrit = !filterCrit || e.criticidade === parseInt(filterCrit)
    const matchDep = !filterDep || e.departamento_id === parseInt(filterDep)
    return matchSearch && matchCrit && matchDep
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar endpoint ou departamento..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, background: '#0d0f14', border: '1px solid #2a2d35',
            borderRadius: 8, padding: '10px 14px', color: '#f0f0f0',
            fontFamily: 'JetBrains Mono', fontSize: 13, outline: 'none',
          }}
        />
        <select value={filterCrit} onChange={e => setFilterCrit(e.target.value)}
          style={{ background: '#0d0f14', border: '1px solid #2a2d35', borderRadius: 8, padding: '10px 14px', color: '#aaa', fontFamily: 'JetBrains Mono', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
          <option value="">Todas criticidades</option>
          {Object.entries(CRITICIDADE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterDep} onChange={e => setFilterDep(e.target.value)}
          style={{ background: '#0d0f14', border: '1px solid #2a2d35', borderRadius: 8, padding: '10px 14px', color: '#aaa', fontFamily: 'JetBrains Mono', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
          <option value="">Todos departamentos</option>
          {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <Btn onClick={openAdd}>+ Novo Endpoint</Btn>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'JetBrains Mono', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2128' }}>
              {['#', 'Endpoint', 'Criticidade', 'Departamento', 'Ações'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: '#555' }}>Nenhum endpoint encontrado.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #13151a' }}
                onMouseEnter={ev => ev.currentTarget.style.background = '#0f1116'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 14px', color: '#444' }}>{e.id}</td>
                <td style={{ padding: '12px 14px', color: '#c9d1e0', fontWeight: 600 }}>{e.endpoint}</td>
                <td style={{ padding: '12px 14px' }}><Badge criticidade={e.criticidade} /></td>
                <td style={{ padding: '12px 14px', color: e.departamento_nome ? '#7eb6f6' : '#444' }}>
                  {e.departamento_nome || '—'}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="ghost" onClick={() => openEdit(e)} style={{ padding: '5px 12px', fontSize: 11 }}>Editar</Btn>
                    <Btn variant="danger" onClick={() => del(e.id)} style={{ padding: '5px 12px', fontSize: 11 }}>Remover</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Novo Endpoint' : 'Editar Endpoint'} onClose={() => setModal(null)}>
          <Input label="ENDPOINT / HOST"
            value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
            placeholder="ex: servidor01.empresa.local" autoFocus />
          <Select label="CRITICIDADE"
            value={form.criticidade} onChange={e => setForm(f => ({ ...f, criticidade: e.target.value }))}>
            {Object.entries(CRITICIDADE).map(([k, v]) => (
              <option key={k} value={k}>{k} — {v.label}</option>
            ))}
          </Select>
          <Select label="DEPARTAMENTO"
            value={form.departamento_id} onChange={e => setForm(f => ({ ...f, departamento_id: e.target.value }))}>
            <option value="">Sem departamento</option>
            {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </Select>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={save}>Salvar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState('endpoints')
  const [departamentos, setDepartamentos] = useState([])
  const [toast, setToast] = useState(null)
  const [healthy, setHealthy] = useState(null)

  const loadDeps = useCallback(async () => {
    try {
      const data = await apiFetch('/departamentos')
      setDepartamentos(data)
    } catch {}
  }, [])

  useEffect(() => {
    loadDeps()
    apiFetch('/health').then(() => setHealthy(true)).catch(() => setHealthy(false))
  }, [])

  function notify(msg, type = 'success') {
    setToast({ msg, type, key: Date.now() })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090b0f', color: '#f0f0f0' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #090b0f; }
        @keyframes slideIn { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0d0f14; }
        ::-webkit-scrollbar-thumb { background: #2a2d35; border-radius: 3px; }
        select option { background: #111318; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1a1d25',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60,
        background: '#0d0f14',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #4f8ef7, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>⬡</div>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>
            Endpoint Manager
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: healthy === null ? '#555' : healthy ? '#22c55e' : '#ef4444',
            boxShadow: healthy ? '0 0 6px #22c55e' : '',
          }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#555' }}>
            {healthy === null ? 'conectando...' : healthy ? 'db online' : 'db offline'}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #1a1d25', padding: '0 32px', display: 'flex', gap: 0 }}>
        {[
          { key: 'endpoints', label: 'Endpoints' },
          { key: 'departamentos', label: 'Departamentos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 20px', fontFamily: 'Syne', fontWeight: 600, fontSize: 14,
            color: tab === t.key ? '#f0f0f0' : '#555',
            borderBottom: tab === t.key ? '2px solid #4f8ef7' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        {tab === 'departamentos' && (
          <DepartamentosTab departamentos={departamentos} onRefresh={loadDeps} notify={notify} />
        )}
        {tab === 'endpoints' && (
          <EndpointsTab departamentos={departamentos} notify={notify} />
        )}
      </main>

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
