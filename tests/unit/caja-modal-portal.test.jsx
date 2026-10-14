// Bug real reportado: en Caja, con una caja larga (muchos movimientos
// cargados, página scrolleada), el modal "Nuevo movimiento" (y
// "Cerrar caja" en complejos NO-VIP) aparecía cortado/pegado al
// contenido scrolleado en vez de centrado en el viewport real.
//
// Causa real: el wrapper de cada página (`className="fade-in"`, ver
// src/index.css) corre `animation: fadeIn ... forwards` — el keyframe
// final deja `transform: translateY(0)` aplicado PERMANENTEMENTE
// (fill-mode forwards retiene el último keyframe, y translateY(0) es
// un transform ≠ none, aunque sea visualmente un no-op). Cualquier
// transform ≠ none en un ancestro crea un "containing block" nuevo
// para descendientes `position: fixed` — el `fixed inset-0` del modal
// quedaba anclado a la caja de ese wrapper (más alta que el viewport
// con muchos movimientos) en vez de al viewport real.
//
// jsdom no implementa layout/paint real (no corre animaciones CSS ni
// resuelve containing blocks de verdad), así que no se puede
// reproducir el bug visual acá — la verificación visual real vive en
// las capturas de Playwright de esta tarea. Lo que SÍ se puede probar
// en jsdom, y lo que importa para no reintroducir el bug sin darse
// cuenta: que el modal usa createPortal a document.body — su nodo
// real queda FUERA del subárbol de cualquier wrapper ancestro
// (incluido uno con exactamente el `transform` que causaba el bug),
// sin importar dónde se lo monte lógicamente en el árbol de React.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal as ModalCaja } from '../../src/pages/Caja'
import { Modal as ModalCajaTemporada } from '../../src/pages/CajaTemporada'

describe.each([
  ['Caja.jsx (Cabañas VIP)', ModalCaja],
  ['CajaTemporada.jsx (NO-VIP — "Nuevo movimiento" y "Cerrar caja" comparten este mismo componente)', ModalCajaTemporada],
])('%s — Modal vía createPortal', (_nombre, ModalComponent) => {
  it('el nodo del modal se monta FUERA del wrapper ancestro (document.body directo), no anidado dentro de él', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'fade-in'
    // Mismo transform que deja el fill-mode:forwards del keyframe real
    // (translateY(0)) — justo el que crea el containing block del bug.
    wrapper.style.transform = 'translateY(0px)'
    document.body.appendChild(wrapper)

    render(
      <ModalComponent title="Nuevo movimiento" onClose={() => {}}>
        <p>Contenido de prueba</p>
      </ModalComponent>,
      { container: wrapper }
    )

    const titulo = screen.getByText('Nuevo movimiento')
    expect(document.body.contains(titulo)).toBe(true)
    expect(wrapper.contains(titulo)).toBe(false)

    document.body.removeChild(wrapper)
  })

  it('clickear el backdrop sigue llamando a onClose (comportamiento preservado tras el portal)', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ModalComponent title="X" onClose={onClose}>
        <p>Contenido</p>
      </ModalComponent>
    )

    // El backdrop es el contenedor con el texto — buscamos el div
    // fixed inset-0 (el padre del título) y lo clickeamos directo,
    // fuera del área de la tarjeta blanca.
    const backdrop = screen.getByText('X').closest('[class*="fixed"]')
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('clickear DENTRO de la tarjeta del modal NO llama a onClose (stopPropagation preservado tras el portal)', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ModalComponent title="X" onClose={onClose}>
        <p>Contenido clickeable</p>
      </ModalComponent>
    )

    await user.click(screen.getByText('Contenido clickeable'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
