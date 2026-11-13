function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  if (err.code === '23505') return res.status(409).json({ error: 'Registro já existe' })
  if (err.code === '23503') return res.status(400).json({ error: 'Referência inválida' })
  console.error(err)
  res.status(500).json({ error: 'Erro interno' })
}

module.exports = { httpError, errorHandler }
