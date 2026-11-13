const express = require('express')
const { healthRouter } = require('./routes/health')
const { errorHandler } = require('./errors')

function createApp({ pool, ddClient, oidc, config }) {
  const app = express()
  app.use(express.json())
  app.use(healthRouter({ pool, ddClient }))
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
