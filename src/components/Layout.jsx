import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/reservas', label: 'Reservas' },
  { to: '/disponibilidad', label: 'Disponibilidad' },
  { to: '/caja', label: 'Caja' },
  { to: '/ganancias', label: 'Ganancias' },
  { to: '/precios', label: 'Precios' },
]

export default function Layout({ children }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-800 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg tracking-wide">Cabañas VIP</span>
          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-primary-800'
                      : 'text-white hover:bg-primary-700'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={handleSignOut}
            className="text-sm text-primary-100 hover:text-white transition-colors"
          >
            Salir
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
