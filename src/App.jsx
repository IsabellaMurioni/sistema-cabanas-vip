import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ComplejoProvider } from './context/ComplejoContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Reservas from './pages/Reservas'
import ReservaForm from './pages/ReservaForm'
import ReservaDetalle from './pages/ReservaDetalle'
import Disponibilidad from './pages/Disponibilidad'
import Caja from './pages/Caja'
import Ganancias from './pages/Ganancias'
import ReservaPago from './pages/ReservaPago'
import Precios from './pages/Precios'
import RedirectAComplejoDefault from './components/RedirectAComplejoDefault'
import RequiereSeccion from './components/RequiereSeccion'

export default function App() {
  return (
    <AuthProvider>
      <ComplejoProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <RedirectAComplejoDefault />
                </PrivateRoute>
              }
            />
            <Route
              path="/:complejoSlug/*"
              element={
                <PrivateRoute>
                  <Layout>
                    <Routes>
                      <Route path="reservas"            element={<Reservas />} />
                      <Route path="reservas/nueva"       element={<ReservaForm />} />
                      <Route path="reservas/:id"         element={<ReservaDetalle />} />
                      <Route path="reservas/:id/pago"    element={<ReservaPago />} />
                      <Route path="reservas/:id/editar"  element={<ReservaForm />} />
                      <Route path="disponibilidad"       element={<Disponibilidad />} />
                      <Route path="caja"                 element={<RequiereSeccion seccion="Caja"><Caja /></RequiereSeccion>} />
                      <Route path="ganancias"            element={<RequiereSeccion seccion="Ganancias"><Ganancias /></RequiereSeccion>} />
                      <Route path="precios"              element={<RequiereSeccion seccion="Precios"><Precios /></RequiereSeccion>} />
                      <Route path="*"                    element={<Navigate to="reservas" replace />} />
                    </Routes>
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ComplejoProvider>
    </AuthProvider>
  )
}
