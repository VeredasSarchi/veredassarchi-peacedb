# Administracion de usuarios

Esta Edge Function concentra el acceso privilegiado a Supabase Auth. La clave
`SUPABASE_SERVICE_ROLE_KEY` permanece exclusivamente en el entorno server-side
de Supabase y nunca debe agregarse como variable `VITE_*`.

La funcion tiene `verify_jwt = false` en `supabase/config.toml` para permitir
que el navegador complete el preflight CORS. Esto no hace publica ninguna
operacion: todas las solicitudes `POST` validan el Bearer token contra Auth y
exigen el rol `admin` dentro del handler.

## Despliegue

1. Ejecutar primero la migracion
   `202608270001_add_user_administration_security.sql`.
2. Consultar el UUID del administrador principal que no podra eliminarse ni
   degradarse desde la interfaz:

   ```sql
   select id, email
   from auth.users
   where raw_app_meta_data ->> 'role' = 'admin'
   order by created_at
   limit 1;
   ```

3. Configurar el UUID como secreto del proyecto:

   ```sh
   npx supabase secrets set PROTECTED_ADMIN_USER_ID=60965679-a575-4942-83ec-00af2b24f04a --project-ref yomrocqrrufbexghxcte
   ```

4. Desplegar la funcion:

   ```sh
   npx supabase functions deploy admin-users --project-ref yomrocqrrufbexghxcte
   ```

Si se necesita transferir la proteccion a otro administrador, primero se crea o
promueve la nueva cuenta y luego se actualiza `PROTECTED_ADMIN_USER_ID`.
