import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PrivateRoute({ children }) {
  const { session } = useAuth()

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>
  }

  return session ? children : <Navigate to="/login" replace />
}
