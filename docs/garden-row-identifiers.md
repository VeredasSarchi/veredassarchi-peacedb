# Filas alfanumericas de jardines

## Modelo

- jardin.filas_lote sigue siendo SMALLINT: cantidad de filas.
- jardin_fila persiste cada identificador VARCHAR(20), su jardin y su orden.
- lote.numero_fila_lote cambia a VARCHAR(20), admitiendo NULL.
- La FK compuesta (id_jardin, numero_fila_lote) exige que la fila pertenezca al jardin.
- Se eliminan espacios y se convierten letras a mayusculas. Se admiten A-Z y 0-9, de 1 a 20 caracteres.
- Las filas se muestran por orden; sus lotes por id_lote ascendente.
- Las filas vacias permanecen visibles. Los NULL se muestran como "Sin fila asignada".
- Los registros inesperados se muestran como "sin configurar", sin inventar asignaciones.
- El catalogo admite lectura autenticada; la escritura desde la aplicacion utiliza una RPC administrativa.
- Jardin y filas se guardan en una transaccion. Un control diferido exige que la cantidad coincida con el catalogo.
- Eliminar una fila con lotes falla. Renombrarla actualiza solo la asignacion de sus lotes mediante FK ON UPDATE CASCADE.

## Aplicacion controlada

1. Respaldar la base de datos y ejecutar supabase/scripts/audit_garden_rows.sql en el SQL Editor del proyecto correcto.
2. Comprobar que existe numero_fila_lote SMALLINT y la funcion es_usuario_admin_actual().
   Son dependencias de las migraciones 202610190001 y 202608270001.
3. Revisar y ejecutar **solo** supabase/migrations/202610230001_persist_garden_row_identifiers.sql.
   Incluye BEGIN/COMMIT: cualquier error revierte toda la migracion.
   No ejecutar un db push general sin revisar el historial: puede incluir otras migraciones pendientes.
4. Revisar y ejecutar por separado supabase/scripts/correct_mesias_row_v.sql.
   La consulta de solo lectura del 23/10/2026 encontro MESIAS id 17, 12 filas y 6 lotes en la fila 12.
   El usuario confirmo que esos lotes corresponden a V. El script comprueba esas condiciones antes de cambiar
   la fila a V. Si ya se corrigio o cambiaron los datos, aborta para revision.
5. Verificar las consultas siguientes. Despues publicar el frontend.
   Cerrar pestanas con versiones anteriores: esas versiones solo admiten filas numericas.

~~~sql
SELECT j.nombre, j.filas_lote, f.identificador, f.orden, count(l.id_lote) AS lotes
FROM public.jardin j
JOIN public.jardin_fila f USING (id_jardin)
LEFT JOIN public.lote l ON l.id_jardin = f.id_jardin AND l.numero_fila_lote = f.identificador
GROUP BY j.id_jardin, j.nombre, j.filas_lote, f.identificador, f.orden
ORDER BY j.id_jardin, f.orden;

SELECT id_lote, numero_lote, id_jardin
FROM public.lote WHERE numero_fila_lote IS NULL;
~~~

La migracion principal materializa el rango numerico configurado en el sistema anterior, incluyendo filas vacias.
Convierte cada valor numerico existente a texto sin cambiar nombres, IDs, tipos o espacios.
Si encuentra filas fuera del rango antiguo, aborta y solicita revision.
No asigna filas a lotes NULL. La correccion especial de MESIAS no forma parte de esa conversion generica.
Una vista adicional dependiente del tipo que no aparezca en el repositorio puede impedir ALTER TYPE;
revisar la auditoria y no usar CASCADE para forzar la migracion.

## Uso en la aplicacion

### Eliminar un jardin y sus filas

Aplicar tambien supabase/migrations/202610230002_delete_garden_with_rows.sql
despues de la migracion 202610230001 y antes de publicar esta opcion.
Esta migracion cambia solamente la FK de jardin_fila a ON DELETE CASCADE y crea
la RPC administrativa eliminar_jardin_con_filas; no elimina datos al ejecutarse.

En el listado Jardines, el administrador puede pulsar "Eliminar jardin".
El popup exige introducir el nombre exacto, incluyendo mayusculas, acentos y espacios.
La confirmacion empieza vacia cada vez que se abre y el boton permanece deshabilitado
hasta que coincide. Supabase verifica nuevamente el permiso y el nombre actual,
bloqueando el jardin durante la operacion.

La eliminacion es permanente y afecta solo al ID seleccionado y sus filas.
Si hay cualquier lote (incluso sin fila asignada) o cenizario, se rechaza toda la operacion.
Las relaciones de lotes y cenizarios conservan sus restricciones; no se borran en cascada.
La eliminacion no permite borrar jardines con informacion operativa asociada.

### Crear y configurar

- Agregar jardin: escribir nombre/cantidad, pulsar "Actualizar cantidad", editar identificadores y ordenar con Subir/Bajar.
- Configurar filas: abrir el jardin y usar "Configurar filas". Las filas mantienen su ID al reordenar o renombrar.
- Agregar lote: seleccionar el identificador guardado, por ejemplo V. El nombre del lote permanece independiente.
- Cambiar un lote: abrirlo, seleccionar otra fila y pulsar "Guardar fila".
- Guardar ocupantes sigue siendo una operacion separada.

## Importacion SQL

Crear primero el jardin y todas sus filas en **una misma transaccion**. No inferir identificadores de la cantidad.
Para jardines existentes, usar sus IDs y filas reales. Esta es una plantilla para un jardin nuevo:

~~~sql
BEGIN;
DO $$
DECLARE jardin_id INTEGER;
BEGIN
  INSERT INTO public.jardin(nombre, filas_lote)
    VALUES ('EJEMPLO IMPORTACION', 5) RETURNING id_jardin INTO jardin_id;
  INSERT INTO public.jardin_fila(id_jardin, identificador, orden)
    VALUES (jardin_id, '1', 1), (jardin_id, '2', 2), (jardin_id, 'P', 3),
           (jardin_id, 'U', 4), (jardin_id, 'V', 5);
  -- Insertar lotes con id_jardin=jardin_id y numero_fila_lote='P', etc.
  -- Elegir id_tipo_lote real y crear lote_espacio segun el procedimiento de importacion.
END;
$$;
COMMIT;
~~~

Para renombrar una fila existente, actualizar jardin_fila.identificador:
la FK propaga el identificador a los lotes. Para modificar la cantidad, actualizar jardin y catalogo
en la misma transaccion. Las inserciones SQL no crean automaticamente espacios de lotes.

## Verificacion

npm ci instala tambien PGlite, una dependencia exclusiva de desarrollo.
npm run test:garden-rows ejecuta PostgreSQL embebido en memoria; nunca se conecta a Supabase.
La suite comprueba conversion de datos, integridad de lotes/espacios, filas mixtas, cambios P a V,
recarga de datos, filas vacias, orden de filas/lotes, duplicados, aislamiento entre jardines,
renombrado con cascada, conteos, permisos del catalogo y la correccion de MESIAS.
La funcion administrativa existente se simula en las pruebas; no reemplaza una prueba de Auth en staging.

Verificar adicionalmente en staging los formularios en navegador: crear jardin numerico y mixto,
crear lotes P y 3, mover P a V, recargar, revisar LA PAZ, revisar V en MESIAS y probar la seleccion
en contratos/precontratos con un administrador y un vendedor.

Archivos principales: migracion SQL, script MESIAS, auditoria, GardenRowsDialog.tsx,
garden-rows.ts, Jardines.tsx, JardinDetalle.tsx, PreClienteForm.tsx y tipos de Supabase.
Los tipos se actualizan localmente siguiendo la estructura generada; regenerarlos contra staging
despues de aplicar la migracion si ese entorno tiene el esquema completo.
