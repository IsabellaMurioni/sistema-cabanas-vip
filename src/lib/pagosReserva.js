// Regla de negocio compartida entre ReservaForm.jsx y ReservaPago.jsx:
// el total pagado de una reserva nunca puede superar su precio total —
// aplica a todos los complejos por igual. Se comparte acá porque ambos
// archivos necesitan exactamente la misma regla, aplicada a una fuente
// de "total pagado" distinta en cada uno (ReservaForm: sena1+sena2+
// pago_cabana del form; ReservaPago: lo ya pagado + el pago nuevo).

// Suma sena1_monto + sena2_monto + pago_cabana_monto — la combinación
// que ReservaForm.jsx guarda como "total pagado" de una reserva.
export function totalPagadoReserva(sena1Monto, sena2Monto, pagoCabanaMonto) {
  return Number(sena1Monto || 0) + Number(sena2Monto || 0) + Number(pagoCabanaMonto || 0)
}

// true si el total pagado excede el precio de la reserva. Un precio de
// $0/sin cargar nunca bloquea (no hay nada contra qué comparar).
export function excedeSaldoReserva(precioTotal, totalPagado) {
  const precio = Number(precioTotal || 0)
  return precio > 0 && Number(totalPagado || 0) > precio
}
