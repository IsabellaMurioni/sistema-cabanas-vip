import { Navigate, useParams } from 'react-router-dom'
import { useComplejo, seccionVisible } from '../context/ComplejoContext'

// Fase 6 — guard de UX genérico por sección: si el rol de la membresía
// activa no ve `seccion` (mismo mapa que ya usa Layout.jsx para el
// sidebar, ver SECCIONES_OCULTAS_POR_ROL en ComplejoContext.jsx),
// redirige a Reservas en vez de dejar que la página intente cargar y
// se encuentre con una tabla vacía/rota por el bloqueo real de RLS
// (021_membresias_rol.sql / 024_membresias_rol_limitado_reservas.sql).
// El bloqueo de verdad es el de la base — esto es sólo para no mostrar
// una pantalla rota si alguien escribe la URL a mano. Antes se llamaba
// RequiereAccesoCompleto y sólo cubría Ganancias/Precios (el único caso
// que existía cuando sólo había un rol restringido); ahora también
// cubre Caja para 'limitado_reservas', sin duplicar la regla en un
// segundo lugar — un único `seccion` por ruta, resuelto contra el mismo
// mapa que el sidebar.
export default function RequiereSeccion({ seccion, children }) {
  const { complejoSlug } = useParams()
  const { rolActivo } = useComplejo()
  if (!seccionVisible(seccion, rolActivo)) {
    return <Navigate to={`/${complejoSlug}/reservas`} replace />
  }
  return children
}
