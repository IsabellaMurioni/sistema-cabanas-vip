// Login.jsx — toggle de mostrar/ocultar contraseña (ícono de ojo). El
// input arranca en type="password" (oculto) y el botón alterna a
// type="text" y viceversa, sin tocar el valor tipeado ni enviar el
// form (el botón es type="button" a propósito). Renderiza el
// componente real, no reimplementa el toggle.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '../../src/pages/Login'

vi.mock('../../src/context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../../src/context/AuthContext'

describe('Login.jsx — toggle de mostrar/ocultar contraseña', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ signIn: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('arranca oculta (type="password") con aria-label "Mostrar contraseña"', () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    const input = screen.getByPlaceholderText('••••••••')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Mostrar contraseña')).toBeInTheDocument()
  })

  it('clickear el toggle la muestra (type="text") y cambia el aria-label a "Ocultar contraseña"', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Login /></MemoryRouter>)
    const input = screen.getByPlaceholderText('••••••••')

    await user.type(input, 'mi-clave-secreta')
    await user.click(screen.getByLabelText('Mostrar contraseña'))

    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('mi-clave-secreta')
    expect(screen.getByLabelText('Ocultar contraseña')).toBeInTheDocument()
  })

  it('clickear el toggle de nuevo la vuelve a ocultar (type="password")', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Login /></MemoryRouter>)
    const input = screen.getByPlaceholderText('••••••••')

    await user.click(screen.getByLabelText('Mostrar contraseña'))
    await user.click(screen.getByLabelText('Ocultar contraseña'))

    expect(input).toHaveAttribute('type', 'password')
  })

  it('el botón del toggle es type="button" — no envía el form', () => {
    render(<MemoryRouter><Login /></MemoryRouter>)
    expect(screen.getByLabelText('Mostrar contraseña')).toHaveAttribute('type', 'button')
  })
})
