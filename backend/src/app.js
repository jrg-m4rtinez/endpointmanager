const express = require('express')
const { healthRouter } = require('./routes/health')
const { errorHandler } = require('./errors')
const { sessionMiddleware } = require('./auth/session')
const { authRouter } = require('./auth/routes')
const { requireAuth, requireXhrOnWrite } = require('./auth/guards')
const { departamentosRouter } = require('./routes/departamentos')
const { tiposRouter } = require('./routes/tipos')
const { endpointsRouter } = require('./routes/endpoints')

function createApp({ pool, ddClient, oidc, config }) {
  const app = express()
  if (config.secureCookies) app.set('trust proxy', 1)
  app.locals.pool = pool
  app.use(express.json())
  app.use(sessionMiddleware(pool, config))
  app.use(healthRouter({ pool, ddClient }))
  app.use(authRouter({ pool, oidc, config }))
  // Rotas de dados: requireAuth + requireXhrOnWrite; cada router aplica requireRole.
  // Tasks seguintes adicionam seus routers à lista.
  app.use(requireAuth, requireXhrOnWrite, departamentosRouter(), tiposRouter(), endpointsRouter())
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
