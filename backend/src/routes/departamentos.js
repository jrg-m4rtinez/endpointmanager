const { nomeRouter } = require('./nomeCrud')

const departamentosRouter = () =>
  nomeRouter({ base: '/departamentos', tabela: 'departamento', fk: 'departamento_id', rotulo: 'Departamento' })

module.exports = { departamentosRouter }
