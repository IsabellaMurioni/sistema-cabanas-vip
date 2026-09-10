import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useComplejo, navItemsVisibles } from '../context/ComplejoContext'

function Icon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const I = {
  cabin:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  reservas:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  calendar:
    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  wallet:
    'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  chart:
    'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  tag:
    'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  menu:
    'M4 6h16M4 12h16M4 18h16',
  logout:
    'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  chevronDown:
    'M6 9l6 6 6-6',
  lock:
    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
}

export default function Layout({ children }) {
  const { session, signOut } = useAuth()
  const { todosLosComplejos, complejosConAcceso, complejoActivo, cambiarComplejo, cargando, rolActivo } = useComplejo()
  const navigate = useNavigate()
  const { complejoSlug } = useParams()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [complejoMenuOpen, setComplejoMenuOpen] = useState(false)
  const complejoMenuRef = useRef(null)

  // 'limitado_caja_silvia' no ve Ganancias ni Precios; 'limitado_reservas'
  // tampoco ve Caja (ver SECCIONES_OCULTAS_POR_ROL en ComplejoContext.jsx) —
  // mismo criterio que RequiereSeccion.jsx (guard real de esas rutas) y
  // que el bloqueo de RLS en la base (021_membresias_rol.sql /
  // 024_membresias_rol_limitado_reservas.sql): esto es sólo la capa de
  // UX, la que de verdad importa es la de RLS.
  const NAV = navItemsVisibles([
    { to: `/${complejoSlug}/reservas`,       label: 'Reservas',       icon: 'reservas'  },
    { to: `/${complejoSlug}/disponibilidad`, label: 'Disponibilidad', icon: 'calendar'  },
    { to: `/${complejoSlug}/caja`,           label: 'Caja',           icon: 'wallet'    },
    { to: `/${complejoSlug}/ganancias`,      label: 'Ganancias',      icon: 'chart'     },
    { to: `/${complejoSlug}/precios`,        label: 'Precios',        icon: 'tag'       },
  ], rolActivo)

  const email    = session?.user?.email || ''
  const userName = email.split('@')[0] || 'Usuario'
  const initial  = userName[0]?.toUpperCase() || 'U'

  const sinComplejo       = cargando || !complejoActivo
  const nombreComplejo    = sinComplejo ? 'Cabañas VIP' : complejoActivo.nombre
  const ubicacionComplejo = sinComplejo ? 'Santa Clara del Mar' : complejoActivo.ubicacion

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (complejoMenuRef.current && !complejoMenuRef.current.contains(e.target)) {
        setComplejoMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (cargando || !complejoSlug) return
    if (complejoActivo?.slug === complejoSlug) return
    const match = todosLosComplejos.find((c) => c.slug === complejoSlug)
    const primerComplejo = todosLosComplejos.find((c) => complejosConAcceso.includes(c.id))
    if (!match || !complejosConAcceso.includes(match.id)) {
      if (primerComplejo) navigate(`/${primerComplejo.slug}/reservas`, { replace: true })
      return
    }
    cambiarComplejo(match.id)
  }, [complejoSlug, cargando, todosLosComplejos, complejosConAcceso, complejoActivo])

  return (
    <div className="min-h-screen bg-white flex">

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── SIDEBAR ───────────────────────────────────────── */}
      <aside
        style={{ backgroundColor: 'var(--color-primario)', transition: 'transform 0.3s ease' }}
        className={[
          'fixed top-0 left-0 h-full w-60 flex flex-col z-30',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div
          className="relative flex items-center gap-3 px-5 py-6"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}
          ref={complejoMenuRef}
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <span className="text-white"><Icon d={I.cabin} size={17} /></span>
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              data-testid="complejo-switcher-toggle"
              onClick={() => setComplejoMenuOpen((v) => !v)}
              className="flex items-center gap-2 w-full min-w-0 select-none text-left"
            >
              <span className="min-w-0 flex-1">
                <p data-testid="complejo-activo-nombre" className="text-white font-bold text-[17px] leading-tight tracking-tight truncate">
                  {nombreComplejo}
                </p>
                <p className="text-white/60 text-[11px] leading-tight mt-0.5 truncate">{ubicacionComplejo}</p>
              </span>
              <span
                className="text-white/70 flex-shrink-0 transition-transform duration-150"
                style={{ transform: complejoMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <Icon d={I.chevronDown} size={14} />
              </span>
            </button>

            {complejoMenuOpen && (
              <div className="absolute left-5 right-5 top-full mt-2 bg-white rounded-xl shadow-lg border border-black/5 py-2 z-40">
                {todosLosComplejos.map((complejo) => {
                  const tieneAcceso = complejosConAcceso.includes(complejo.id)
                  const esActivo = complejoActivo?.id === complejo.id
                  return (
                    <button
                      key={complejo.id}
                      type="button"
                      data-testid={`complejo-option-${complejo.slug}`}
                      disabled={!tieneAcceso}
                      onClick={() => {
                        if (!tieneAcceso) return
                        cambiarComplejo(complejo.id)
                        const resto = location.pathname.split('/').slice(2).join('/')
                        navigate(`/${complejo.slug}/${resto || 'reservas'}`)
                        setComplejoMenuOpen(false)
                      }}
                      className={[
                        'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors duration-150',
                        tieneAcceso
                          ? esActivo
                            ? 'text-[#111111] bg-[#f5ede0]'
                            : 'text-[#111111] hover:bg-[#f5ede0] cursor-pointer'
                          : 'text-gray-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      <span className="truncate">{complejo.nombre}</span>
                      {!tieneAcceso && (
                        <span className="text-gray-300 flex-shrink-0">
                          <Icon d={I.lock} size={13} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => [
                'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium',
                'transition-all duration-150 select-none',
                isActive
                  ? 'bg-white text-[var(--color-primario)]'
                  : 'text-white hover:bg-white/20',
              ].join(' ')}
            >
              <Icon d={I[icon]} size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold capitalize truncate">{userName}</p>
              <p className="text-white/60 text-[10px] truncate">{email}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="text-white/50 hover:text-white transition-colors flex-shrink-0 p-1 rounded-lg hover:bg-white/10"
            >
              <Icon d={I.logout} size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-60">

        {/* Top header */}
        <header className="bg-white h-16 flex items-center px-5 md:px-7 sticky top-0 z-10"
                style={{ borderBottom: '1px solid #f0e6d8' }}>

          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden mr-4 text-[#888] hover:text-[#333] transition-colors p-1"
            onClick={() => setOpen(true)}
          >
            <Icon d={I.menu} size={22} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                 style={{ backgroundColor: 'var(--color-primario)' }}>
              {initial}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-[#111111] capitalize leading-tight">{userName}</p>
              <p className="text-[11px] text-[#888888] leading-tight">{email}</p>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 md:p-7 min-w-0 bg-white">
          {cargando || !complejoActivo ? (
            <div className="flex items-center justify-center h-full text-[#888] text-sm">
              Cargando...
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
