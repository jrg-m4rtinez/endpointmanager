const express = require('express')
const { healthRouter } = require('./routes/health')
const { errorHandler } = require('./errors')
const { sessionMiddleware } = require('./auth/session')
const { authRouter } = require('./auth/routes')
const { requireAuth, requireSenhaTrocada, requireXhrOnWrite } = require('./auth/guards')
const { departamentosRouter } = require('./routes/departamentos')
const { tiposRouter } = require('./routes/tipos')
const { endpointsRouter } = require('./routes/endpoints')
const { usuariosRouter } = require('./routes/usuarios')
const { naoClassificadosRouter } = require('./routes/naoClassificados')
const { statsRouter } = require('./routes/stats')

function createApp({ pool, ddClient, oidc, config }) {
  const app = express()
  app.disable('x-powered-by')
  if (config.secureCookies) app.set('trust proxy', 1)
  app.locals.pool = pool
  app.use(express.json())
  app.use(sessionMiddleware(pool, config))
  app.use(healthRouter({ pool, ddClient }))
  app.use(authRouter({ pool, oidc, config }))
  // Rotas de dados: requireAuth + requireSenhaTrocada + requireXhrOnWrite; cada router aplica requireRole.
  // Tasks seguintes adicionam seus routers à lista.
  app.use(requireAuth, requireSenhaTrocada, requireXhrOnWrite, departamentosRouter(), tiposRouter(), endpointsRouter(), usuariosRouter(),
    naoClassificadosRouter({ ddClient }), statsRouter({ ddClient }))
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
