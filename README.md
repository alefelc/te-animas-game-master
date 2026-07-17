# ¿Te animás? — Dirección adaptativa 1.8.3

API Node.js que selecciona la próxima carta con OpenAI y conserva un selector adaptativo local como recuperación controlada.

## Comandos

```bash
npm ci
npm test
npm run build
npm start
```

## Endpoints

- `GET /health`: proceso activo y diagnóstico del último intento.
- `GET /ready`: comprueba conectividad y autenticación contra el servicio de contenido.
- `GET /health/ai`: historial reciente de decisiones.
- `POST /v1/game-master/next`: selecciona la próxima carta.

## Variables

Usar `.env.example`. `OPENAI_API_KEY` puede quedar vacío para pruebas: la API responderá con su selector adaptativo local y explicará el motivo en el diagnóstico.

## Despliegue

El contenedor escucha en el puerto `3000`. El healthcheck usa `/health`; para verificar que todas las dependencias estén disponibles usar `/ready`.

## Importante para repositorios actualizados por “Add files via upload”

La interfaz web de GitHub no elimina archivos antiguos. Esta revisión compila sólo `src/*.ts`, por lo que los restos viejos del frontend ya no rompen Docker. Para limpiar el repositorio definitivamente se incluye `LIMPIAR-RESTOS-FRONTEND.ps1`.

Antes de publicar también puede ejecutarse `VALIDAR-BUILD-API.ps1` en Windows.

Las credenciales (`OPENAI_API_KEY`, `DIRECTUS_TOKEN`, etc.) deben configurarse como variables de ejecución del servicio, nunca como argumentos de compilación del Dockerfile.

## Contrato 1.8.3

El contrato `v6-scene-role-normalized` no rechaza una solicitud por valores históricos o personalizados de `gm_scene_role`. Los alias se convierten y los valores desconocidos se infieren a partir del nivel, intensidad y puntajes de la carta.

El endpoint protegido `GET /diagnostics/contract` informa:

```json
{
  "request_contract": "v6-scene-role-normalized",
  "scene_role_contract": {
    "accepts_legacy_aliases": true,
    "accepts_unknown_values": true
  }
}
```
