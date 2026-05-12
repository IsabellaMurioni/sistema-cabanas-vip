import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Reservas from './pages/Reservas'
import ReservaForm from './pages/ReservaForm'
import ReservaDetalle from './pages/ReservaDetalle'
import Disponibilidad from './pages/Disponibilidad'
import Caja from './pages/Caja'
import Ganancias from './pages/Ganancias'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route path="/reservas"                element={<Reservas />} />
                    <Route path="/reservas/nueva"          element={<ReservaForm />} />
                    <Route path="/reservas/:id"            element={<ReservaDetalle />} />
                    <Route path="/reservas/:id/editar"     element={<ReservaForm />} />
                    <Route path="/disponibilidad"          element={<Disponibilidad />} />
                    <Route path="/caja"                    element={<Caja />} />
                    <Route path="/ganancias"               element={<Ganancias />} />
                    <Route path="*"                        element={<Navigate to="/reservas" replace />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
