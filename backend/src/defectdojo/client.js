// Formato observado de `location_value` no DefectDojo 3.5.0 (modelo Locations/URL):
// URL completa com barra final e porta padrao omitida, ex.:
//   https://api.loja.lab/   http://api.loja.lab:8080/   https://db01.infra.lab:8443/
// O id da location e o id da URL (/api/v2/url/) coincidem.
const { normalizeHost, hostFromLocationValue } = require('./hosts')

class DefectDojoError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DefectDojoError'
  }
}

function createDefectDojoClient({
  baseUrl, apiKey, fetchImpl = fetch, ttlMs = 60000, timeoutMs = 10000, now = Date.now,
}) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  let cache = null // { at, data }
  let inflight = null

  async function get(pathAndQuery) {
    let res
    try {
      res = await fetchImpl(base + pathAndQuery, {
        headers: { Authorization: `Token ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new DefectDojoError(`Tempo esgotado ao consultar o DefectDojo (${timeoutMs} ms).`)
      }
      throw new DefectDojoError('Não foi possível conectar ao DefectDojo.')
    }
    if (!res.ok) {
      throw new DefectDojoError(`DefectDojo respondeu com erro HTTP ${res.status}.`)
    }
    try {
      return await res.json()
    } catch {
      throw new DefectDojoError('Resposta inválida do DefectDojo.')
    }
  }

  async function paginate(path, params) {
    const out = []
    const qs = new URLSearchParams({ ...params, limit: '1000' })
    let next = `${path}?${qs}`
    while (next) {
      const page = await get(next)
      out.push(...(page.results || []))
      if (page.next) {
        // só pathname+search: atrás de proxy o DefectDojo pode devolver outra origem
        const u = new URL(page.next, 'http://x')
        next = u.pathname + u.search
      } else {
        next = null
      }
    }
    return out
  }

  async function fetchHosts() {
    const [urls, findings, locProducts, products] = await Promise.all([
      paginate('/api/v2/url/', {}),
      paginate('/api/v2/location_findings/', { location_type_exact: 'url', status_equals: 'Active' }),
      paginate('/api/v2/location_products/', { location_type_exact: 'url' }),
      paginate('/api/v2/products/', {}),
    ])
    const productName = new Map(products.map(p => [p.id, p.name]))
    const hosts = new Map() // host -> { ids:Set, produtos:Set, findings:Set }
    const locHost = new Map() // location id -> host
    const entry = h => {
      if (!hosts.has(h)) hosts.set(h, { produtos: new Set(), findings: new Set() })
      return hosts.get(h)
    }
    for (const u of urls) {
      const h = u.host ? normalizeHost(u.host) : hostFromLocationValue(u.string)
      if (!h) continue
      entry(h)
      locHost.set(u.id, h)
    }
    const resolve = r => locHost.get(r.location) ?? hostFromLocationValue(r.location_value)
    for (const r of findings) {
      const h = resolve(r)
      if (h && hosts.has(h)) hosts.get(h).findings.add(r.finding)
    }
    for (const r of locProducts) {
      const h = resolve(r)
      const name = productName.get(r.product)
      if (h && hosts.has(h) && name) hosts.get(h).produtos.add(name)
    }
    return [...hosts.entries()]
      .map(([host, v]) => ({
        host,
        produtos: [...v.produtos].sort((a, b) => a.localeCompare(b)),
        findingsAtivos: v.findings.size,
      }))
      .sort((a, b) => a.host.localeCompare(b.host))
  }

  async function listHosts({ force = false } = {}) {
    if (!force && cache && now() - cache.at < ttlMs) return cache.data
    if (inflight) return inflight
    inflight = fetchHosts()
      .then(data => {
        cache = { at: now(), data }
        return data
      })
      .finally(() => { inflight = null })
    return inflight
  }

  async function ping() {
    await get('/api/v2/products/?limit=1')
  }

  return { listHosts, ping }
}

module.exports = { createDefectDojoClient, DefectDojoError }
