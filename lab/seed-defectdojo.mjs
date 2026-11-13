// Seed idempotente do DefectDojo LOCAL (lab) com dados ficticios.
// Uso: DD_ADMIN_USER=admin DD_ADMIN_PASSWORD=... [DD_URL=http://127.0.0.1:8081] node lab/seed-defectdojo.mjs
// Escreve apenas via API v2. Nao grava credenciais.

const BASE = (process.env.DD_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const USER = process.env.DD_ADMIN_USER;
const PASS = process.env.DD_ADMIN_PASSWORD;
if (!USER || !PASS) {
  console.error('Defina DD_ADMIN_USER e DD_ADMIN_PASSWORD no ambiente.');
  process.exit(1);
}

// produto -> URLs com quantidade de findings ativos e mitigados
const PLAN = {
  Loja: [
    { host: 'api.loja.lab', protocol: 'https', port: null, path: '/', ativos: 7, mitigados: 2 },
    { host: 'api.loja.lab', protocol: 'http', port: 8080, path: '/', ativos: 5, mitigados: 0 },
    { host: 'checkout.loja.lab', protocol: 'https', port: null, path: '/', ativos: 5, mitigados: 1 },
  ],
  Infra: [
    { host: 'db01.infra.lab', protocol: 'https', port: 8443, path: '/', ativos: 20, mitigados: 3 },
    { host: 'db02.infra.lab', protocol: 'https', port: 8443, path: '/', ativos: 0, mitigados: 4 },
    { host: 'grafana.infra.lab', protocol: 'http', port: 3000, path: '/', ativos: 4, mitigados: 0 },
    { host: 'intranet.lab', protocol: 'https', port: null, path: '/', ativos: 1, mitigados: 0 },
  ],
  Rede: [
    { host: 'vpn.rede.lab', protocol: 'https', port: null, path: '/', ativos: 3, mitigados: 1 },
    { host: 'fw01.rede.lab', protocol: 'https', port: 8443, path: '/', ativos: 8, mitigados: 0 },
  ],
};
const SEVS = [['Critical', 'S0'], ['High', 'S1'], ['Medium', 'S2'], ['Low', 'S3'], ['Info', 'S4']];

const DEFAULT_PORT = { http: 80, https: 443 };
const stats = { created: 0, found: 0 };
let token;

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 500)}`);
  return json;
}

async function listAll(path) {
  const sep = path.includes('?') ? '&' : '?';
  let out = [];
  let url = `${path}${sep}limit=500&offset=0`;
  while (url) {
    const page = await api('GET', url);
    out = out.concat(page.results);
    url = page.next ? page.next.replace(BASE, '') : null;
  }
  return out;
}

async function ensure(label, finder, creator) {
  const existing = await finder();
  if (existing) { stats.found++; return existing; }
  const created = await creator();
  stats.created++;
  console.log(`  criado: ${label}`);
  return created;
}

async function main() {
  const auth = await api('POST', '/api/v2/api-token-auth/', { username: USER, password: PASS });
  token = auth.token;

  const prodType = await ensure('product_type Lab',
    async () => (await api('GET', '/api/v2/product_types/?name=Lab&limit=100')).results.find((p) => p.name === 'Lab'),
    () => api('POST', '/api/v2/product_types/', { name: 'Lab', description: 'Dados ficticios do lab' }));

  const testType = (await api('GET', '/api/v2/test_types/?name=Pen%20Test&limit=100')).results.find((t) => t.name === 'Pen Test');
  if (!testType) throw new Error('test_type "Pen Test" nao encontrado');

  const lfKeys = new Set((await listAll('/api/v2/location_findings/?location_type_exact=url')).map((l) => `${l.finding}:${l.location}`));
  const lpKeys = new Set((await listAll('/api/v2/location_products/?location_type_exact=url')).map((l) => `${l.product}:${l.location}`));
  const allUrls = await listAll('/api/v2/url/');

  for (const [prodName, entries] of Object.entries(PLAN)) {
    const product = await ensure(`product ${prodName}`,
      async () => (await api('GET', `/api/v2/products/?name=${encodeURIComponent(prodName)}&limit=100`)).results.find((p) => p.name === prodName),
      () => api('POST', '/api/v2/products/', { name: prodName, description: `Produto ficticio ${prodName} (lab)`, prod_type: prodType.id }));

    const engName = `Lab seed ${prodName}`;
    const eng = await ensure(`engagement ${engName}`,
      async () => (await api('GET', `/api/v2/engagements/?product=${product.id}&limit=100`)).results.find((e) => e.name === engName),
      () => api('POST', '/api/v2/engagements/', {
        name: engName, product: product.id, target_start: '2026-11-01', target_end: '2026-12-31', status: 'In Progress',
      }));

    const testTitle = `Lab seed test ${prodName}`;
    const test = await ensure(`test ${testTitle}`,
      async () => (await api('GET', `/api/v2/tests/?engagement=${eng.id}&limit=100`)).results.find((t) => t.title === testTitle),
      () => api('POST', '/api/v2/tests/', {
        engagement: eng.id, test_type: testType.id, title: testTitle,
        target_start: '2026-11-01T00:00:00Z', target_end: '2026-12-31T00:00:00Z',
      }));

    const byTitle = new Map((await listAll(`/api/v2/findings/?test=${test.id}`)).map((f) => [f.title.toLowerCase(), f]));

    for (const e of entries) {
      const key = `${e.protocol}://${e.host}${e.port ? ':' + e.port : ''}${e.path}`;
      let url = allUrls.find((u) => u.host === e.host && u.protocol === e.protocol && (u.port ?? DEFAULT_PORT[u.protocol]) === (e.port ?? DEFAULT_PORT[e.protocol]));
      if (!url) {
        url = await api('POST', '/api/v2/url/', { host: e.host, protocol: e.protocol, port: e.port, path: e.path });
        allUrls.push(url);
        stats.created++;
        console.log(`  criado: url ${key}`);
      } else stats.found++;
      const loc = url.location_id ?? url.location ?? url.id;

      if (!lpKeys.has(`${product.id}:${loc}`)) {
        await api('POST', '/api/v2/location_products/', { location: loc, product: product.id, status: 'Active' });
        lpKeys.add(`${product.id}:${loc}`);
        stats.created++;
        console.log(`  criado: location_product ${key} -> ${prodName}`);
      } else stats.found++;

      const total = e.ativos + e.mitigados;
      for (let i = 1; i <= total; i++) {
        const mitigated = i > e.ativos;
        const title = `[lab] ${key} vuln ${String(i).padStart(2, '0')}`;
        let f = byTitle.get(title.toLowerCase());
        if (!f) {
          const [severity, numerical_severity] = SEVS[(i - 1) % SEVS.length];
          f = await api('POST', '/api/v2/findings/', {
            title, test: test.id, severity, numerical_severity,
            description: `Finding ficticio de lab para ${key}`,
            found_by: [testType.id], active: !mitigated, verified: false,
            is_mitigated: mitigated, date: '2026-11-10',
          });
          byTitle.set(title.toLowerCase(), f);
          stats.created++;
        } else stats.found++;
        if (!lfKeys.has(`${f.id}:${loc}`)) {
          await api('POST', '/api/v2/location_findings/', {
            finding: f.id, location: loc, status: mitigated ? 'Mitigated' : 'Active',
          });
          lfKeys.add(`${f.id}:${loc}`);
          stats.created++;
        } else stats.found++;
      }
    }
  }

  // Resumo lido da API
  const lfs = await listAll('/api/v2/location_findings/?location_type_exact=url&status_equals=Active');
  const lps = await listAll('/api/v2/location_products/?location_type_exact=url');
  const prodNames = new Map((await listAll("/api/v2/products/")).map((p) => [p.id, p.name]));
  const hostOf = (v) => new URL(v).hostname;
  const hosts = {};
  for (const lp of lps) {
    const h = hostOf(lp.location_value);
    (hosts[h] ??= { produtos: new Set(), ativos: 0 }).produtos.add(prodNames.get(lp.product) ?? lp.product);
  }
  for (const lf of lfs) {
    const h = hostOf(lf.location_value);
    (hosts[h] ??= { produtos: new Set(), ativos: 0 }).ativos++;
  }
  console.log('\n== Resumo ==');
  for (const h of Object.keys(hosts).sort()) {
    console.log(`${h}\tprodutos=${[...hosts[h].produtos].join(',')}\tfindingsAtivos=${hosts[h].ativos}`);
  }
  console.log(`criados=${stats.created} existentes=${stats.found}`);
  console.log(`DD_API_KEY=${auth.token}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
