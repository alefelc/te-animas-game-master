# Game Master 5.0.3-r1 — repositorio EasyPanel

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
- healthcheck: `/ready`.

`OPENAI_API_KEY`, `DIRECTUS_TOKEN`, `COUPLE_INVITE_PEPPER`,
`DIAGNOSTIC_TOKEN` y el resto de la configuración privada deben cargarse en
**Environment**, como variables de ejecución. No las agregues en
**Build Arguments**.

El único argumento de construcción necesario es:

```env
BUILD_RELEASE=5.0.3-r1
```

## Acceso obligatorio

`POST /v1/game-master/next` exige `Authorization: Bearer <token>` y valida que
pertenezca a una cuenta activa antes de leer la partida o consultar OpenAI. Las
solicitudes sin sesión o con sesión inválida responden `401`; además se aplican
límites separados por IP y por cuenta.

La validación de la sesión usa el token del propio usuario y no depende del
token interno utilizado para perfiles o datos de pareja. Una falla en esas
funciones opcionales ya no invalida un login correcto.

Desplegá este servicio antes de publicar la web 5.1.2-r1.
