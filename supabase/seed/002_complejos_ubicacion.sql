-- ============================================================
-- 002_complejos_ubicacion.sql
-- Datos (no esquema): completa el campo `ubicacion` de los
-- complejos ya cargados, y de paso corrige el nombre de MIMMO a
-- "Mimmo" (capitalización estándar, en vez del slug en mayúsculas
-- usado hasta ahora). 100% aditivo/update sobre filas existentes
-- — no toca Cabañas VIP ni ninguna otra columna de estos complejos.
-- Depende de 001_complejos_nuevos.sql ya corrido (para que existan
-- las filas de casas-azahar / los-amigos / chacras-del-mar).
--
-- STAGING ONLY por ahora. Producción recibe esta carga recién en
-- el corte de Fase 6, junto con el resto del proyecto multi-
-- complejo — no correr contra producción todavía.
-- ============================================================

update complejos set nombre = 'Mimmo', ubicacion = 'Mar Azul' where slug = 'mimmo';
update complejos set ubicacion = 'Mar de las Pampas' where slug = 'casas-azahar';
update complejos set ubicacion = 'Mar Azul' where slug = 'los-amigos';
update complejos set ubicacion = 'Mar Azul' where slug = 'chacras-del-mar';
