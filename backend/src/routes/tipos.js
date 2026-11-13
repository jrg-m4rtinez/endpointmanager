const { nomeRouter } = require('./nomeCrud')

const tiposRouter = () => nomeRouter({ base: '/tipos', tabela: 'tipo', fk: 'tipo_id', rotulo: 'Tipo' })

module.exports = { tiposRouter }
