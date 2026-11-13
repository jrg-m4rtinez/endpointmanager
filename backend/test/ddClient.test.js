import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { normalizeHost, hostFromLocationValue } = require('../src/defectdojo/hosts')
const { createDefectDojoClient, DefectDojoError } = require('../src/defectdojo/client')
const fx = n => require(`./fixtures/dd/${n}.json`)

const BASE = 'https://dojo.real:8443'

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function makeFetch() {
  const calls = []
  const impl = async (url, opts = {}) => {
    const u = new URL(url)
    calls.push({ url: u, opts })
    if (u.origin !== BASE) throw new Error('origem inesperada ' + u.origin)
    switch (u.pathname) {
      case '/api/v2/url/':
        return json(u.searchParams.get('offset') === '5' ? fx('url-page2') : fx('url-page1'))
      case '/api/v2/location_findings/': return json(fx('location_findings'))
      case '/api/v2/location_products/': return json(fx('location_products'))
      case '/api/v2/products/': return json(fx('products'))
      default: return json({}, 404)
    }
  }
  return { impl, calls }
}

// valor esperado: ids de finding distintos por host, derivados da fixture
function expectedFindings(host) {
  const s = new Set()
  for (const r of fx('location_findings').results) {
    if (hostFromLocationValue(r.location_value) === host) s.add(r.finding)
  }
  return s.size
}

describe('hosts helpers', () => {
  it('normalizeHost', () => expect(normalizeHost('  A.B ')).toBe('a.b'))
  it('hostFromLocationValue', () => {
    expect(hostFromLocationValue('https://A.b:8443/x')).toBe('a.b')
    expect(hostFromLocationValue('a.b')).toBe('a.b')
    expect(hostFromLocationValue('::')).toBeNull()
  })
})

describe('cliente DefectDojo', () => {
  let f, now, t, client
  beforeEach(() => {
    f = makeFetch(); t = 1000; now = () => t
    client = createDefectDojoClient({ baseUrl: BASE + '/', apiKey: 'segredo123', fetchImpl: f.impl, now })
  })

  it('agrupa URLs do mesmo host e conta findings ativos distintos', async () => {
    const hosts = await client.listHosts()
    const api = hosts.find(h => h.host === 'api.loja.lab')
    expect(api.produtos).toEqual(['Loja'])
    expect(api.findingsAtivos).toBe(expectedFindings('api.loja.lab'))
    expect(api.findingsAtivos).toBe(12)
    const db01 = hosts.find(h => h.host === 'db01.infra.lab')
    expect(db01.findingsAtivos).toBe(expectedFindings('db01.infra.lab'))
    expect(db01.produtos).toEqual(['Infra'])
  })

  it('lista host sem findings e não cria hosts fantasmas do produto demo', async () => {
    const hosts = await client.listHosts()
    const db02 = hosts.find(h => h.host === 'db02.infra.lab')
    expect(db02).toEqual({ host: 'db02.infra.lab', produtos: ['Infra'], findingsAtivos: 0 })
    const esperados = new Set([...fx('url-page1').results, ...fx('url-page2').results].map(u => u.host.trim().toLowerCase()))
    expect(hosts.map(h => h.host).sort()).toEqual([...esperados].sort())
    expect(hosts.some(h => h.produtos.includes('Conta AWS Lab'))).toBe(false)
  })

  it('segue next por todas as páginas, ignorando a origem do next', async () => {
    await client.listHosts()
    const urlCalls = f.calls.filter(c => c.url.pathname === '/api/v2/url/')
    expect(urlCalls.map(c => c.url.searchParams.get('offset'))).toEqual([null, '5'])
    expect(f.calls.every(c => c.url.origin === BASE)).toBe(true)
    const lf = f.calls.find(c => c.url.pathname === '/api/v2/location_findings/').url
    expect(lf.searchParams.get('location_type_exact')).toBe('url')
    expect(lf.searchParams.get('status_equals')).toBe('Active')
    expect(lf.searchParams.get('limit')).toBe('1000')
  })

  it('normaliza caixa/espaço do host', async () => {
    const custom = async url => {
      const u = new URL(url)
      if (u.pathname === '/api/v2/url/') return json({ next: null, results: [{ id: 1, host: '  Foo.LAB ' }, { id: 2, host: 'foo.lab' }] })
      if (u.pathname === '/api/v2/location_findings/') return json({ next: null, results: [{ location: 1, location_value: 'https://FOO.lab/', finding: 1 }] })
      return json({ next: null, results: [] })
    }
    const c = createDefectDojoClient({ baseUrl: BASE, apiKey: 'k', fetchImpl: custom })
    expect(await c.listHosts()).toEqual([{ host: 'foo.lab', produtos: [], findingsAtivos: 1 }])
  })

  it('usa cache por 60s e refaz com force', async () => {
    await client.listHosts()
    const n = f.calls.length
    t += 59000
    await client.listHosts()
    expect(f.calls.length).toBe(n)
    t += 2000
    await client.listHosts()
    expect(f.calls.length).toBe(n * 2)
    await client.listHosts({ force: true })
    expect(f.calls.length).toBe(n * 3)
  })

  it('chamadas concorrentes compartilham a requisição; falha não é cacheada', async () => {
    const [a, b] = await Promise.all([client.listHosts(), client.listHosts()])
    expect(a).toBe(b)
    expect(f.calls.length).toBe(5)

    let fail = true
    const flaky = async (u, o) => (fail ? json({}, 500) : f.impl(u, o))
    const c = createDefectDojoClient({ baseUrl: BASE, apiKey: 'k', fetchImpl: flaky, now })
    await expect(c.listHosts()).rejects.toBeInstanceOf(DefectDojoError)
    fail = false
    expect((await c.listHosts()).length).toBeGreaterThan(0)
  })

  it('timeout → DefectDojoError', async () => {
    const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason)))
    const c = createDefectDojoClient({ baseUrl: BASE, apiKey: 'segredo123', fetchImpl: hang, timeoutMs: 50 })
    const e = await c.listHosts().catch(x => x)
    expect(e).toBeInstanceOf(DefectDojoError)
    expect(e.message).toMatch(/tempo|timeout/i)
    expect(e.message).not.toContain('segredo123')
  })

  it('erro de rede → DefectDojoError', async () => {
    const c = createDefectDojoClient({ baseUrl: BASE, apiKey: 'segredo123', fetchImpl: async () => { throw new TypeError('fetch failed') } })
    const e = await c.ping().catch(x => x)
    expect(e).toBeInstanceOf(DefectDojoError)
    expect(e.message).not.toContain('segredo123')
  })

  it('HTTP 401 → DefectDojoError', async () => {
    const c = createDefectDojoClient({ baseUrl: BASE, apiKey: 'segredo123', fetchImpl: async () => json({ detail: 'x' }, 401) })
    const e = await c.listHosts().catch(x => x)
    expect(e).toBeInstanceOf(DefectDojoError)
    expect(e.message).toContain('401')
    expect(e.message).not.toContain('segredo123')
  })

  it('envia Authorization: Token <key>', async () => {
    await client.listHosts()
    for (const c of f.calls) expect(c.opts.headers.Authorization).toBe('Token segredo123')
    expect(f.calls[0].opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('ping faz GET products?limit=1', async () => {
    await client.ping()
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url.pathname).toBe('/api/v2/products/')
    expect(f.calls[0].url.searchParams.get('limit')).toBe('1')
  })
})
