import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('Usuario o contraseña incorrectos')
    } else {
      navigate('/reservas')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(150deg, #ffffff 0%, #fee7ef 100%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: '#d2ab84' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </div>
          <h1 className="text-[30px] font-bold text-[#111111] leading-tight">Cabañas VIP</h1>
          <p className="text-sm text-[#888] mt-1.5">Sistema de gestión de reservas</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[16px] border border-[#f0e6d8] p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="section-label block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="field"
                placeholder="usuario@email.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="section-label block mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="field"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-1 disabled:opacity-50"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
