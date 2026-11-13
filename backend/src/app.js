const express = require('express')
const { healthRouter } = require('./routes/health')
const { errorHandler } = require('./errors')
const { sessionMiddleware } = require('./auth/session')
const { authRouter } = require('./auth/routes')

function createApp({ pool, ddClient, oidc, config }) {
  const app = express()
  if (config.secureCookies) app.set('trust proxy', 1)
  app.locals.pool = pool
  app.use(express.json())
  app.use(sessionMiddleware(pool, config))
  app.use(healthRouter({ pool, ddClient }))
  app.use(authRouter({ pool, oidc, config }))
  // Rotas de dados (tasks seguintes): requireAuth + requireXhrOnWrite; cada router aplica requireRole.
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
