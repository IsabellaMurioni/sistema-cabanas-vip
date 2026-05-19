# Cabañas VIP — Sistema de Reservas

Sistema de gestión interna de reservas para complejo de cabañas. Permite administrar reservas, pagos, disponibilidad y caja desde una única interfaz web.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL + Storage) |
| Email | EmailJS (transaccional, sin servidor) |
| Deploy | Vercel |

## Features

- **Reservas** — alta y edición completa, historial de pagos (señas + pago en cabaña), confirmación automática al registrar pago, validación de solapamientos por cabaña
- **Disponibilidad** — timeline mensual/anual por cabaña con scroll horizontal, vista mobile con cards, fechas ocupadas visibles antes de seleccionar
- **Caja** — registro de movimientos para Silvia, Julia, Banco y Mercado Pago; sincronización automática con reservas
- **Ganancias** — resumen por mes, desglose de reservas por período con detalle expandible
- **Emails automáticos** — confirmación de reserva pendiente y recibos de pago vía EmailJS

## Setup local

```bash
npm install
cp .env.example .env
# completar .env con las credenciales reales (ver tabla abajo)
npm run dev
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto en Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon de Supabase |
| `VITE_EMAILJS_SERVICE_ID` | ID del servicio en EmailJS |
| `VITE_EMAILJS_PUBLIC_KEY` | Clave pública de EmailJS |
| `VITE_EMAILJS_PRIVATE_KEY` | Clave privada de EmailJS (requerida en producción) |
| `VITE_EMAILJS_TEMPLATE_ID` | ID del template de email |

> La `VITE_EMAILJS_PRIVATE_KEY` es necesaria en producción (Vercel) para que los emails funcionen fuera del dominio local, ya que el plan gratuito de EmailJS no permite agregar dominios personalizados.

## Deploy en Vercel

1. Conectar el repositorio a Vercel
2. Agregar todas las variables de entorno en **Settings → Environment Variables**
3. El deploy se dispara automáticamente en cada push a `main`

## Estructura del proyecto

```
src/
  pages/       # Reservas, ReservaForm, Disponibilidad, Caja, Ganancias, Login
  components/  # FileUpload, CalendarPicker
  lib/         # supabase.js, email.js, cabanas.js
  utils/       # emailTemplates.js
public/
  favicon.svg
```
