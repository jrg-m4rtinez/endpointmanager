import { Building2 } from 'lucide-react'
import CadastroSimples from '../components/CadastroSimples.jsx'

export default function Departamentos({ user }) {
  return (
    <CadastroSimples
      titulo="Departamentos"
      descricao="Áreas responsáveis pelos endpoints"
      rota="/departamentos"
      icone={Building2}
      singular="departamento"
      user={user}
    />
  )
}
