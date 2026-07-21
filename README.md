# ¿Te animás? — API 3.0.0-r1

Servicio privado de dirección adaptativa, diagnóstico y cuentas/perfiles.

## Contrato

La API importa solicitudes, respuestas, candidatos y roles de escena desde `@te-animas/contracts`. No copies esos esquemas dentro de este paquete.

## Seguridad

- `DIRECTUS_TOKEN`, `OPENAI_API_KEY` y `DIAGNOSTIC_TOKEN` son secretos exclusivos del servidor.
- La identidad del jugador se valida con su token; las operaciones administrativas usan el token privado del servicio.
- Registro, cuentas y selección de cartas tienen límites de frecuencia independientes.
- Los diagnósticos requieren `DIAGNOSTIC_TOKEN`.

## Validación

Desde la raíz:

```bash
npm run test:api
npm run build:api
```

Salud operativa:

```text
GET /health
GET /ready
```

`/health` informa `api_version: 3.0.0`.

## Docker

Usar la raíz de la release como contexto y `te-animas-game-master-main/Dockerfile` como Dockerfile. Ver `../docs/DEPLOYMENT.md`.
