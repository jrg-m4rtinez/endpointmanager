const { loadConfig, assertRequiredEnv } = require('./src/config')
const { createPool, waitForDb } = require('./src/db')
const { migrate } = require('./src/migrate')
const { createOidc } = require('./src/auth/oidc')
const { createDefectDojoClient } = require('./src/defectdojo/client')
const { createApp } = require('./src/app')

const PORT = 3001

async function retry(label, fn, { retries = 30, delayMs = 2000 } = {}) {
  let lastErr
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      console.log(`${label}: tentativa ${i}/${retries} falhou (${e.message})`)
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw new Error(`${label} indisponível após ${retries} tentativas: ${lastErr && lastErr.message}`)
}

async function main() {
  assertRequiredEnv(process.env)
  const config = loadConfig(process.env)

  const pool = createPool(config)
  await waitForDb(pool)
  await migrate(pool)
  console.log('Migrations applied.')

  // O Keycloak do lab demora a subir: tenta a descoberta OIDC por até ~60 s.
  const oidc = await retry('Descoberta OIDC', () => createOidc(config))
  console.log(`OIDC configurado (issuer ${config.oidc.issuer}).`)

  let ddClient = null
  if (config.dd) {
    ddClient = createDefectDojoClient({ baseUrl: config.dd.url, apiKey: config.dd.apiKey })
    console.log(`DefectDojo configurado (${config.dd.url}).`)
  } else {
    console.log('DefectDojo não configurado (DD_URL/DD_API_KEY ausentes).')
  }

  const app = createApp({ pool, ddClient, oidc, config })
  app.listen(PORT, () => console.log(`API running on :${PORT}`))
}

main().catch((err) => {
  console.error(`Falha ao iniciar a API: ${err.message}`)
  process.exit(1)
})
