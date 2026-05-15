// Genera HTML completo para cada tipo de email.
// El template de EmailJS solo necesita: {{asunto}} en Subject y {{{contenido}}} en Body.

function fmtFecha(d) {
  if (!d) return '-'
  const parts = d.split('T')[0].split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function money(v) {
  if (v === null || v === undefined || v === '') return '0'
  const n = Number(v)
  if (isNaN(n)) return '0'
  return n.toLocaleString('es-AR')
}

function str(v, fallback = '') {
  if (v === null || v === undefined) return fallback
  return String(v)
}

function fila(label, value) {
  return `<tr>
    <td style="color:#9c7c5c;font-size:14px;padding:7px 0;border-bottom:1px solid #f0e4d0;width:55%;">${label}</td>
    <td style="color:#3d3129;font-size:14px;text-align:right;padding:7px 0;border-bottom:1px solid #f0e4d0;">${value}</td>
  </tr>`
}

function card(titulo, cuerpo) {
  return `<div style="background:#fdf3e3;border:1px solid #e8d9c5;border-radius:10px;padding:20px 22px;margin-bottom:16px;">
    <div style="color:#a0713a;font-size:12px;letter-spacing:1.5px;margin-bottom:14px;font-family:'Instrument Serif',Georgia,serif;text-transform:uppercase;">${titulo}</div>
    ${cuerpo}
  </div>`
}

function base(contenido) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f5ede0;font-family:'Instrument Serif',Georgia,serif;color:#3d3129;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5ede0;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;border:1px solid #e8d9c5;border-radius:12px;overflow:hidden;background:#fffaf5;">

          <!-- HEADER -->
          <tr>
            <td style="background:#c8a96e;padding:28px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:400;color:#ffffff;letter-spacing:1px;font-family:'Instrument Serif',Georgia,serif;">Cabañas VIP</div>
              <div style="font-size:12px;color:#fff5e8;letter-spacing:3px;margin-top:5px;font-family:'Instrument Serif',Georgia,serif;">SANTA CLARA DEL MAR</div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:30px 36px;background:#fffaf5;">
              ${contenido}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#fdf3e3;border-top:1px solid #e8d9c5;padding:18px 36px;text-align:center;">
              <div style="color:#c8a96e;font-size:14px;font-family:'Instrument Serif',Georgia,serif;">Cabañas VIP — Santa Clara del Mar</div>
              <div style="color:#9c7c5c;font-size:12px;margin-top:6px;">WhatsApp: 011-5099-5700 &nbsp;·&nbsp; ventashotelesdelacosta@hotmail.com</div>
              <div style="color:#9c7c5c;font-size:12px;margin-top:3px;">www.complejocabanasvip.com</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── EMAIL 1: CONFIRMACIÓN DE RESERVA ────────────────────────────────────────

export function generarEmailConfirmacion(reserva) {
  const sena = Math.ceil(Number(reserva.monto_total || 0) * 0.3)

  const detalleReserva = `<table width="100%" cellpadding="0" cellspacing="0">
    ${fila('Código de reserva', `<strong>${str(reserva.codigo)}</strong>`)}
    ${fila('Cabaña', str(reserva.cabana, '-'))}
    ${fila('Personas', str(reserva.pax, '-'))}
    ${fila('Ingreso', `${fmtFecha(reserva.fecha_entrada)} &nbsp; 14:00 hs`)}
    ${fila('Egreso', `${fmtFecha(reserva.fecha_salida)} &nbsp; 9:00 hs`)}
    ${fila('Noches', str(reserva.noches, '-'))}
  </table>`

  const importes = `<table width="100%" cellpadding="0" cellspacing="0">
    ${fila('Monto total', `$ ${money(reserva.monto_total)}`)}
    <tr>
      <td style="color:#9c7c5c;font-size:14px;padding:10px 0 0;width:55%;">Seña requerida (30%)</td>
      <td style="color:#a0713a;font-size:18px;font-weight:600;text-align:right;padding:10px 0 0;">$ ${money(sena)}</td>
    </tr>
  </table>
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e8d9c5;color:#6b5744;font-size:13px;line-height:1.6;">
    ⚠️ Para confirmar su reserva, abonar la seña dentro de las <strong>48 horas</strong>.
    Pasado ese plazo, la reserva será cancelada automáticamente.
  </div>`

  const datosPago = `
  <p style="margin:0 0 8px;color:#3d3129;font-size:14px;font-weight:600;">1) Transferencia Bancaria — Banco Galicia</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
    ${fila('Razón Social', 'EMPRENDIMIENTOS 2010 S.A.')}
    ${fila('CUIT', '30-71093840-3')}
    ${fila('Cuenta Corriente $', 'N° 829-5 190-1')}
    ${fila('CBU', '0070190320000000829511')}
  </table>
  <p style="margin:0 0 6px;color:#6b5744;font-size:13px;line-height:1.6;">
    Una vez realizada la transferencia, enviá el comprobante por esta vía o por WhatsApp al <strong>011-5099-5700</strong> indicando:
  </p>
  <ul style="margin:0 0 18px 18px;padding:0;color:#6b5744;font-size:13px;line-height:1.9;">
    <li>N° de reserva</li>
    <li>Nombre completo</li>
    <li>DNI / CUIL</li>
    <li>Celular de contacto</li>
    <li>Dirección</li>
  </ul>

  <div style="border-top:1px solid #f0e4d0;margin-bottom:14px;"></div>

  <p style="margin:0 0 4px;color:#3d3129;font-size:14px;font-weight:600;">2) Pago en efectivo</p>
  <p style="margin:0 0 18px;color:#6b5744;font-size:13px;line-height:1.6;">
    Nuevo Quilmes Plaza, oficina 214, Bernal, Buenos Aires.<br>
    Lunes a viernes de 10:00 a 16:00 hs.
  </p>

  <div style="border-top:1px solid #f0e4d0;margin-bottom:14px;"></div>

  <p style="margin:0 0 4px;color:#3d3129;font-size:14px;font-weight:600;">3) Mercado Pago</p>
  <p style="margin:0 0 18px;color:#6b5744;font-size:13px;">Con recargo del 20%. Consultanos para más detalles.</p>

  <div style="border-top:1px solid #e8d9c5;margin-bottom:12px;"></div>
  <p style="margin:0;color:#9c7c5c;font-size:13px;line-height:1.6;">
    <strong style="color:#3d3129;">Ingreso: 14:00 hs — Egreso: 9:00 hs</strong><br>
    El saldo restante se abona en efectivo al ingresar a las cabañas.
  </p>`

  return base(`
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:400;color:#a0713a;font-family:'Instrument Serif',Georgia,serif;">Confirmación de Reserva</h2>
    <p style="margin:0 0 22px;color:#6b5744;font-size:15px;">
      Estimado/a <strong style="color:#3d3129;">${str(reserva.nombre_apellido)}</strong>, confirmamos su reserva en Cabañas VIP.
    </p>
    ${card('Detalle de Reserva', detalleReserva)}
    ${card('Importes', importes)}
    ${card('Modalidades de Pago', datosPago)}
  `)
}

// ─── EMAIL 2: RECIBO DE PAGO ──────────────────────────────────────────────────

export function generarEmailRecibo(reserva, pago) {
  const detalleReserva = `<table width="100%" cellpadding="0" cellspacing="0">
    ${fila('Código de reserva', `<strong>${str(reserva.codigo)}</strong>`)}
    ${fila('Cabaña', str(reserva.cabana, '-'))}
    ${fila('Personas', str(reserva.pax, '-'))}
    ${fila('Ingreso', `${fmtFecha(reserva.fecha_entrada)} &nbsp; 14:00 hs`)}
    ${fila('Egreso', `${fmtFecha(reserva.fecha_salida)} &nbsp; 9:00 hs`)}
  </table>`

  const saldoNum = Number(pago.saldo || 0)

  const resumenCuenta = `<table width="100%" cellpadding="0" cellspacing="0">
    ${fila('Monto total', `$ ${money(reserva.monto_total)}`)}
    ${fila('Total pagado', `$ ${money(pago.total_pagado)}`)}
    <tr>
      <td style="color:#9c7c5c;font-size:14px;padding:10px 0 0;width:55%;">Saldo restante</td>
      <td style="color:${saldoNum > 0 ? '#a0713a' : '#2d7a4f'};font-size:17px;font-weight:600;text-align:right;padding:10px 0 0;">
        $ ${money(saldoNum > 0 ? saldoNum : 0)}
      </td>
    </tr>
  </table>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e8d9c5;color:#6b5744;font-size:13px;">
    ${saldoNum > 0
      ? 'El saldo restante se abona en efectivo al ingresar. Ingreso: 14:00 hs — Egreso: 9:00 hs'
      : '✓ Reserva pagada en su totalidad.'}
  </div>`

  return base(`
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:400;color:#a0713a;font-family:'Instrument Serif',Georgia,serif;">Recibo de Pago</h2>
    <p style="margin:0 0 22px;color:#6b5744;font-size:15px;">
      Estimado/a <strong style="color:#3d3129;">${str(reserva.nombre_apellido)}</strong>, confirmamos la recepción de su pago.
    </p>
    ${card('Pago Recibido', `<table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#9c7c5c;font-size:14px;padding:7px 0;border-bottom:1px solid #f0e4d0;width:55%;">Monto abonado</td>
        <td style="color:#a0713a;font-size:18px;font-weight:600;text-align:right;padding:7px 0;border-bottom:1px solid #f0e4d0;">$ ${money(pago.monto)}</td>
      </tr>
      ${fila('Fecha de pago', fmtFecha(pago.fecha))}
      ${fila('Medio de pago', str(pago.tipo, 'Efectivo'))}
    </table>`)}
    ${card('Detalle de Reserva', detalleReserva)}
    ${card('Resumen de Cuenta', resumenCuenta)}
  `)
}

// ─── EMAIL 3: CANCELACIÓN ─────────────────────────────────────────────────────

export function generarEmailCancelacion(reserva) {
  return base(`
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:400;color:#a0713a;font-family:'Instrument Serif',Georgia,serif;">Reserva Cancelada</h2>
    <p style="margin:0 0 22px;color:#6b5744;font-size:15px;">
      Estimado/a <strong style="color:#3d3129;">${str(reserva.nombre_apellido)}</strong>,
    </p>
    ${card('Aviso', `<p style="margin:0 0 12px;color:#3d3129;font-size:15px;line-height:1.7;">
      Le informamos que habiendo transcurrido el plazo de pago de la seña,
      su reserva <strong>N° ${str(reserva.codigo)}</strong> ha sido dada de baja.
    </p>
    <p style="margin:0;color:#6b5744;font-size:14px;line-height:1.7;">
      Si desea realizar una nueva reserva o tiene alguna consulta, no dude en contactarnos.
    </p>`)}
    ${card('Contacto', `<table width="100%" cellpadding="0" cellspacing="0">
      ${fila('WhatsApp', '011-5099-5700')}
      ${fila('Email', 'ventashotelesdelacosta@hotmail.com')}
      ${fila('Web', 'www.complejocabanasvip.com')}
    </table>`)}
  `)
}
