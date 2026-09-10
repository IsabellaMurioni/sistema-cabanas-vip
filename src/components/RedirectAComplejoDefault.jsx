import { Navigate } from 'react-router-dom'
import { useComplejo } from '../context/ComplejoContext'

export default function RedirectAComplejoDefault() {
  const { complejosConAcceso, todosLosComplejos, cargando } = useComplejo()

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#888] text-sm">
        Cargando...
      </div>
    )
  }

  const primerComplejo = todosLosComplejos.find((c) => complejosConAcceso.includes(c.id))

  if (!primerComplejo) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#888] text-sm px-6 text-center">
        Tu usuario no tiene acceso a ningún complejo todavía. Contactá a un administrador.
      </div>
    )
  }

  return <Navigate to={`/${primerComplejo.slug}/reservas`} replace />
}
