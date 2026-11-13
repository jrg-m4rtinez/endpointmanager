import { Tags } from 'lucide-react'
import CadastroSimples from '../components/CadastroSimples.jsx'

export default function Tipos({ user }) {
  return (
    <CadastroSimples
      titulo="Tipos"
      descricao="Categorias usadas para agrupar os endpoints"
      rota="/tipos"
      icone={Tags}
      singular="tipo"
      user={user}
    />
  )
}
