# Game Master 5.0.1-r2 — repositorio EasyPanel

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
BUILD_RELEASE=5.0.1-r2
```
