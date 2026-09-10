# Fase 6 — Plan de rollback

Este documento cubre qué hacer si algo sale mal durante o después del corte de
producción de Fase 6 (multi-complejo + wipe de datos de Cabañas VIP).

Los pasos están ordenados de **menos** a **más** drástico. Empezar siempre por
(a); (b) es un último recurso; (c) no es un procedimiento — es la explicación
de por qué el wipe no tiene vuelta atrás y qué hacer para no llegar a
necesitarla.

---

## (a) Rollback primario — revertir el deploy de Vercel

Si el problema es de **código/frontend** (una pantalla rota, un cálculo mal,
algo que no carga) y la base de datos todavía está en un estado consistente
(las migraciones/seed/wipe ya corrieron limpio, sin errores a mitad de
camino), el primer y más simple paso es **revertir el deploy, no la base**:

1. Vercel → proyecto → pestaña **Deployments**.
2. Ubicar el deployment de producción anterior al corte de Fase 6 (el último
   que corresponde al código pre-multi-complejo, single-tenant Cabañas VIP).
3. Ese deployment → menú "..." → **Promote to Production** (o "Redeploy" según
   la versión de la UI de Vercel).
4. Confirmar que el dominio de producción vuelve a servir el build anterior.

**Importante:** esto vuelve el FRONTEND al código viejo, pero la base de datos
sigue con el schema/datos de Fase 6 (multi-complejo, VIP vacía). El código
viejo espera el schema viejo (sin `complejo_id` en ningún lado, sin
`membresias.rol`, etc.) — revertir sólo el deploy sin tocar la base puede
dejar el código viejo funcionando contra un schema que ya no es el que
espera, para las tablas que SÍ cambiaron de forma (columnas nuevas no rompen
nada por sí solas, ya que son todas nullable/con default — pero las políticas
RLS reescritas en 012/021 sí cambian el comportamiento para el código viejo,
que nunca pasa `complejo_id` explícito en sus queries).

Si el rollback de deploy por sí solo no alcanza porque el código viejo
necesita las políticas RLS viejas para funcionar, seguir a (b).

---

## (b) Break-glass — revertir la reescritura de políticas RLS

Sólo si (a) no alcanza. Esto vuelve las 5 tablas originales de Cabañas VIP
(`reservas`, `caja_silvia`, `caja_juli`, `caja_banco`, `caja_mercado_pago`) a
sus políticas RLS **anteriores a todo el proyecto multi-complejo**
(`auth.role() = 'authenticated'`, de `001_schema.sql`/`007_update.sql`) — es
decir, "cualquier usuario autenticado puede leer/escribir cualquier fila",
sin ningún filtro por `complejo_id` ni por `membresias`.

```sql
-- ============================================================
-- BREAK-GLASS — revertir RLS de las 5 tablas de Cabañas VIP al
-- estado anterior a Fase 6 (auth.role() = 'authenticated', sin
-- complejo_id ni membresias). NO borra ni modifica ninguna fila —
-- sólo cambia quién puede leer/escribir.
-- ============================================================

-- reservas
drop policy if exists "res_select" on reservas;
drop policy if exists "res_insert" on reservas;
drop policy if exists "res_update" on reservas;
drop policy if exists "res_delete" on reservas;
create policy "res_select" on reservas for select using (auth.role() = 'authenticated');
create policy "res_insert" on reservas for insert with check (auth.role() = 'authenticated');
create policy "res_update" on reservas for update using (auth.role() = 'authenticated');
create policy "res_delete" on reservas for delete using (auth.role() = 'authenticated');

-- caja_silvia
drop policy if exists "silvia_sel" on caja_silvia;
drop policy if exists "silvia_ins" on caja_silvia;
drop policy if exists "silvia_upd" on caja_silvia;
drop policy if exists "silvia_del" on caja_silvia;
create policy "silvia_sel" on caja_silvia for select using (auth.role() = 'authenticated');
create policy "silvia_ins" on caja_silvia for insert with check (auth.role() = 'authenticated');
create policy "silvia_upd" on caja_silvia for update using (auth.role() = 'authenticated');
create policy "silvia_del" on caja_silvia for delete using (auth.role() = 'authenticated');

-- caja_juli
drop policy if exists "juli_sel" on caja_juli;
drop policy if exists "juli_ins" on caja_juli;
drop policy if exists "juli_upd" on caja_juli;
drop policy if exists "juli_del" on caja_juli;
create policy "juli_sel" on caja_juli for select using (auth.role() = 'authenticated');
create policy "juli_ins" on caja_juli for insert with check (auth.role() = 'authenticated');
create policy "juli_upd" on caja_juli for update using (auth.role() = 'authenticated');
create policy "juli_del" on caja_juli for delete using (auth.role() = 'authenticated');

-- caja_banco
drop policy if exists "banco_sel" on caja_banco;
drop policy if exists "banco_ins" on caja_banco;
drop policy if exists "banco_upd" on caja_banco;
drop policy if exists "banco_del" on caja_banco;
create policy "banco_sel" on caja_banco for select using (auth.role() = 'authenticated');
create policy "banco_ins" on caja_banco for insert with check (auth.role() = 'authenticated');
create policy "banco_upd" on caja_banco for update using (auth.role() = 'authenticated');
create policy "banco_del" on caja_banco for delete using (auth.role() = 'authenticated');

-- caja_mercado_pago
drop policy if exists "mp_sel" on caja_mercado_pago;
drop policy if exists "mp_ins" on caja_mercado_pago;
drop policy if exists "mp_upd" on caja_mercado_pago;
drop policy if exists "mp_del" on caja_mercado_pago;
create policy "mp_sel" on caja_mercado_pago for select using (auth.role() = 'authenticated');
create policy "mp_ins" on caja_mercado_pago for insert with check (auth.role() = 'authenticated');
create policy "mp_upd" on caja_mercado_pago for update using (auth.role() = 'authenticated');
create policy "mp_del" on caja_mercado_pago for delete using (auth.role() = 'authenticated');
```

**Qué implica hacer esto:** cualquier usuario autenticado (de cualquier
complejo, con cualquier `rol`) vuelve a poder leer y escribir reservas/caja de
Cabañas VIP sin ningún filtro — exactamente el modelo de seguridad de antes
de que existiera `membresias`. Esto **no** revierte las tablas nuevas
(`periodos_precios`/`precios_pax` con `precio_noche_adicional`, etc.) ni las
columnas nuevas — sólo las políticas de estas 5 tablas puntuales, que es lo
mínimo necesario para que el código pre-Fase-6 vuelva a funcionar si (a) por
sí solo no alcanzó.

Volver a aplicar las políticas de `012_rls_membresias.sql` +
`021_membresias_rol.sql` + `024_membresias_rol_limitado_reservas.sql` (mismo
bloque de estas 5 tablas, tal cual está en esos tres archivos) deshace este
break-glass cuando el problema real ya esté resuelto.

### (b.2) Break-glass — las 4 tablas de Caja NUEVAS de Fase 6 (no existían antes)

`movimientos_caja`, `cierres_caja`, `cierre_reconciliacion` y
`cierre_reparto_ganancia` son tablas que **no existían en absoluto** antes de
Fase 6 (las crean las migraciones 015/017, dentro de este mismo corte) — el
código pre-Fase-6 no las conoce ni las consulta, así que no tiene sentido
"revertirlas a como estaban antes de todo el proyecto multi-complejo" (nunca
existieron en ese estado). Lo que sí puede hacer falta es un break-glass más
puntual: si `024_membresias_rol_limitado_reservas.sql` (el `and rol =
'completo'` que agregó a estas 4) causa un problema real — por ejemplo, algún
usuario `'completo'` que debería tener acceso y por algún motivo no lo tiene
— esto las vuelve a su estado post-017/pre-024 (filtrado sólo por
`complejo_id`, sin mirar `rol` para nada), sin tocar las otras 5 tablas de
arriba ni la NUEVA policy de `caja_silvia`:

```sql
-- ============================================================
-- BREAK-GLASS (b.2) — revertir las 4 tablas NUEVAS de Caja NO-VIP al
-- estado post-017/pre-024 (complejo_id solo, sin condición de rol).
-- NO son un revert al "antes de Fase 6" — esas tablas no existían
-- antes de Fase 6, este es el estado inmediatamente anterior a
-- 024_membresias_rol_limitado_reservas.sql.
-- ============================================================

-- movimientos_caja
drop policy if exists "movimientos_caja_select" on movimientos_caja;
drop policy if exists "movimientos_caja_all" on movimientos_caja;
create policy "movimientos_caja_select" on movimientos_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "movimientos_caja_all" on movimientos_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

-- cierres_caja
drop policy if exists "cierres_caja_select" on cierres_caja;
drop policy if exists "cierres_caja_all" on cierres_caja;
create policy "cierres_caja_select" on cierres_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierres_caja_all" on cierres_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

-- cierre_reconciliacion
drop policy if exists "cierre_reconciliacion_select" on cierre_reconciliacion;
drop policy if exists "cierre_reconciliacion_all" on cierre_reconciliacion;
create policy "cierre_reconciliacion_select" on cierre_reconciliacion for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierre_reconciliacion_all" on cierre_reconciliacion for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

-- cierre_reparto_ganancia
drop policy if exists "cierre_reparto_ganancia_select" on cierre_reparto_ganancia;
drop policy if exists "cierre_reparto_ganancia_all" on cierre_reparto_ganancia;
create policy "cierre_reparto_ganancia_select" on cierre_reparto_ganancia for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierre_reparto_ganancia_all" on cierre_reparto_ganancia for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
```

**Qué implica hacer esto:** cualquier `rol` (incluido `'limitado_reservas'` y
`'limitado_caja_silvia'`) vuelve a tener acceso a estas 4 tablas en cualquier
complejo donde tenga membresía — el único filtro vuelve a ser `complejo_id`,
igual que estaba entre las migraciones 017 y 024. Volver a aplicar el bloque
correspondiente de `024_membresias_rol_limitado_reservas.sql` deshace esto.

---

## (c) ⚠️ El wipe de datos de VIP (paso 4 del corte) NO tiene rollback

**Esto es lo más importante de todo este documento — leerlo antes de correr
`supabase/cutover/003_wipe_vip.sql`, no después.**

El wipe usa `TRUNCATE ... CASCADE` sobre `reservas`, `caja_silvia`,
`caja_juli`, `caja_banco`, `caja_mercado_pago`, `movimientos_caja`,
`email_logs`, `periodos_precios` y `precios_pax`. `TRUNCATE` no es una
operación transaccional-reversible desde la aplicación ni desde ningún
`UPDATE`/`DELETE` posterior — una vez corrida, esas filas **no existen más**,
punto. Ni (a) ni (b) de este documento hacen nada al respecto — ninguno de
los dos toca datos, sólo código (deploy) o permisos (RLS).

**La ÚNICA forma de recuperar reservas/caja/precios de Cabañas VIP después de
correr el wipe es restaurar el backup completo de producción tomado antes del
wipe** (Supabase → Database → Backups, o el mecanismo de backup que use ese
proyecto — point-in-time recovery si el plan lo incluye, o un backup manual
explícito tomado justo antes).

Por eso, en orden, **antes** de correr `003_wipe_vip.sql`:

1. **Tomar (o confirmar que existe) un backup de producción posterior al
   último dato real que se quiera poder recuperar.**
2. **Verificar que ese backup es restaurable** — no asumir que "existe" es lo
   mismo que "funciona". Si el plan de Supabase lo permite, probar una
   restauración a un proyecto de prueba, o al menos confirmar con Supabase
   Support/documentación que ese tipo de backup es restaurable en este plan.
3. Recién después de confirmar (2), correr `003_wipe_vip.sql`.

Si el wipe corre y después aparece un problema — un dato que hacía falta
conservar, una reserva real que no era de prueba, lo que sea — **la respuesta
no es "arreglarlo con SQL"**, porque no hay SQL que reconstruya una fila ya
truncada. La respuesta es restaurar el backup pre-wipe y volver a evaluar
desde ahí.
