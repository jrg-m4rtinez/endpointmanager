import { freshDatabase } from './db'
import { createFakeOidc } from './fakeOidc'
import { createApp } from '../../src/app'
import { migrate } from '../../src/migrate'
import { loadConfig } from '../../src/config'

export async function buildTestApp({ ddClient = null, bootstrapAdminEmail, appBaseUrl = 'http://localhost:3000' } = {}) {
  const { pool, drop } = await freshDatabase()
  await migrate(pool)
  const config = loadConfig({
    APP_BASE_URL: appBaseUrl,
    SESSION_SECRET: 'test-secret',
    BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail,
  })
  const app = createApp({ pool, ddClient, oidc: createFakeOidc(), config })
  return { app, pool, drop }
}

export async function loginAs(agent, { sub, email, name }) {
  await agent.get('/auth/login')
  const qs = new URLSearchParams({ sub, email, name }).toString()
  return agent.get(`/auth/callback?${qs}`)
}
