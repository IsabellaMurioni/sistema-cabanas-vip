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
      navigate('/')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(150deg, #ffffff 0%, #f4f4f5 100%)' }}
    >
      <div className="w-full max-w-md fade-in">
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: '#111111' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold text-[#111111] leading-tight md:whitespace-nowrap">Reservas Complejos del Mar</h1>
          <p className="text-sm text-[#888] mt-1.5">Sistema de gestión de reservas</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[16px] border border-[#f0e6d8] shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="section-label block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="field !bg-white !border-[#e0e0e0] focus:!border-[#111111] focus:!shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
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
                className="field !bg-white !border-[#e0e0e0] focus:!border-[#111111] focus:!shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
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
              className="w-full mt-1 py-3 rounded-[10px] font-semibold text-sm text-white bg-[#111111] hover:bg-[#2a2a2a] hover:-translate-y-px active:scale-[0.98] active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
