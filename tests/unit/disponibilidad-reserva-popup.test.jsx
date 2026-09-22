// Bug real reportado: el popup de una reserva (Disponibilidad.jsx,
// se abre al clickear la barra de una reserva en el timeline) ocultaba
// TODO el bloque Total/Saldo cuando `reserva.monto_total > 0` era
// falso — una reserva a $0 no mostraba nada, ni siquiera "$0". Ahora
// el bloque se muestra siempre que haya un valor cargado (0 incluido)
// y sólo se oculta si monto_total es null/undefined/''. Renderiza el
// componente real (ReservaPopup, exportado además del default), no
// reimplementa la condición.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReservaPopup } from '../../src/pages/Disponibilidad'

vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { useComplejo } from '../../src/context/ComplejoContext'

useComplejo.mockReturnValue({ getCabanaColor: () => '#123456' })

const baseReserva = {
  codigo: 'A2600', cabana: 'Cabaña 1', estado: 'Confirmada',
  nombre_apellido: 'Huésped de Prueba', celular: '',
  fecha_entrada: '2026-03-01', fecha_salida: '2026-03-03',
  pax: 2, noches: 2,
  sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
}

describe('ReservaPopup (código real) — bloque Total/Saldo con monto_total = $0', () => {
  it('reserva a $0 → muestra el bloque con "$0" (Total) y "$0" (Saldo), no lo oculta', () => {
    render(<ReservaPopup reserva={{ ...baseReserva, monto_total: 0 }} onClose={() => {}} onView={() => {}} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Saldo')).toBeInTheDocument()
    // Dos "$0": uno para Total, otro para Saldo.
    expect(screen.getAllByText('$0')).toHaveLength(2)
  })

  it('reserva SIN precio cargado (monto_total null) → sigue ocultando el bloque', () => {
    render(<ReservaPopup reserva={{ ...baseReserva, monto_total: null }} onClose={() => {}} onView={() => {}} />)
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo')).not.toBeInTheDocument()
  })

  it('reserva SIN precio cargado (monto_total undefined) → sigue ocultando el bloque', () => {
    const { monto_total, ...sinMonto } = { ...baseReserva, monto_total: undefined }
    void monto_total
    render(<ReservaPopup reserva={sinMonto} onClose={() => {}} onView={() => {}} />)
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('reserva normal (monto_total > 0) no cambia de comportamiento', () => {
    render(<ReservaPopup reserva={{ ...baseReserva, monto_total: 15000, sena1_monto: 5000 }} onClose={() => {}} onView={() => {}} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('$15.000')).toBeInTheDocument()
    expect(screen.getByText('$10.000')).toBeInTheDocument() // saldo = 15000 - 5000
  })
})
