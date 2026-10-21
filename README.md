# Game Master 5.0.4-r1 — repositorio EasyPanel

Este paquete es autocontenido. Subí a GitHub todo el contenido de esta carpeta.
El repositorio debe mostrar en su raíz:

```text
Dockerfile
package.json
package-lock.json
packages/
te-animas-game-master-main/
```

En EasyPanel configurá:

- método de construcción: Dockerfile;
- Dockerfile: `Dockerfile`;
- contexto: raíz del repositorio;
- puerto: `3000`;
- healthcheck del contenedor y EasyPanel: `/health` (proceso vivo, sin red externa).
- `/ready` se reserva para diagnóstico de conexión a Directus; no reiniciar el
  contenedor porque una dependencia externa tenga una caída transitoria.

`OPENAI_API_KEY`, `DIRECTUS_TOKEN`, `COUPLE_INVITE_PEPPER`,
`DIAGNOSTIC_TOKEN` y el resto de la configuración privada deben cargarse en
**Environment**, como variables de ejecución. No las agregues en
**Build Arguments**.

El único argumento de construcción necesario es:

```env
BUILD_RELEASE=5.0.4-r1
```

## Acceso obligatorio

`POST /v1/game-master/next` exige `Authorization: Bearer <token>` y valida que
pertenezca a una cuenta activa antes de leer la partida o consultar OpenAI. Las
solicitudes sin sesión o con sesión inválida responden `401`; además se aplican
límites separados por IP y por cuenta.

La validación de la sesión usa el token del propio usuario y no depende del
token interno utilizado para perfiles o datos de pareja. Una falla en esas
funciones opcionales ya no invalida un login correcto.

## Configuración necesaria para cuentas

En **Environment** de Game Master:

```env
DIRECTUS_URL=https://admin.teanimas.com
DIRECTUS_TOKEN=<token-interno-configurado-en-el-servidor>
PLAYER_ROLE_ID=<uuid-del-rol-Jugadores-no-administrador>
ACCOUNT_INVITE_URL=https://teanimas.com/?auth=accept-invite
```

No usar el token de un editor de cartas: se necesitan permisos privados de
cuentas. El token interno debe poder leer/crear usuarios y enviar invitaciones
(`POST /users/invite`), además de acceder a `pc_user_profiles` y las colecciones
privadas de pareja si se usan. No darle estos permisos al rol público.
El rol Jugadores debe permitir leer **solo su propio** `/users/me` con los
campos `id,email,first_name,last_name,status`. No necesita acceso al panel.

En **Environment de Directus** deben estar permitidas las URLs del frontend:

```env
USER_INVITE_URL_ALLOW_LIST=https://teanimas.com/?auth=accept-invite
PASSWORD_RESET_URL_ALLOW_LIST=https://teanimas.com/?auth=reset-password
```

Si ya hay URLs permitidas, agregarlas sin borrar las existentes. SMTP se
configura en Directus (`EMAIL_TRANSPORT`, `EMAIL_FROM`, `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`,
`EMAIL_SMTP_SECURE` según proveedor). Para Gmail usar una contraseña de aplicación,
no la contraseña habitual. No guardar credenciales en GitHub.
La API de invitaciones de Directus puede responder aceptado antes de terminar
el envío: revisar los logs SMTP si no llega el correo. No se puede certificar
la entrega solo con el HTTP 202 de esta API.

## Resiliencia y verificación

La ausencia de `COUPLE_INVITE_PEPPER` o un valor inseguro ya no cierra todo
el proceso. Solo se bloquean crear/aceptar invitaciones de pareja con HTTP 503
(`COUPLE_INVITES_NOT_CONFIGURED`), sin usar `DIRECTUS_TOKEN` como reemplazo.
Para habilitarlas, usar un secreto independiente de al menos 32 caracteres y
conservarlo: rotarlo invalida invitaciones pendientes.
La lectura de perfil devuelve `profile_available: false` cuando falla, para
no confundir una caída con preferencias eliminadas.

Desplegar este servicio y después la web **5.1.7-r1**. Actualizar
`BUILD_RELEASE` si está sobrescrito como argumento de construcción.
`GET /health` debe responder `version: 5.0.4`; su bloque `features` indica
si hay rol de registro y secreto de invitaciones configurados (no certifica SMTP).
Si sigue en 502, revisar el log de arranque en EasyPanel: GitHub no puede
resolver un servicio parado, un secreto obligatorio ausente o un puerto mal asignado.

Verificación local: `npm test` y `npm run test:smoke` (compila y realiza
10 comprobaciones HTTP contra un Directus simulado local, sin enviar correo real).
