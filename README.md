# API privada 5.0.1-r1

Servicio de dirección adaptativa, cuentas, perfiles y vinculación privada de pareja.

## Fronteras

- `@te-animas/game-domain`: reglas deterministas de escena.
- `@te-animas/contracts`: contrato web/API.
- OpenAI: elige solo entre candidatas previamente compatibles.
- Directus: acceso administrativo exclusivamente desde el servidor.

## Seguridad

`DIRECTUS_TOKEN`, `OPENAI_API_KEY`, `DIAGNOSTIC_TOKEN` y `COUPLE_INVITE_PEPPER` no llegan al navegador. Las respuestas privadas de pareja no se exponen; solo se devuelven coincidencias positivas agregadas.

```bash
npm run test:api
npm run build:api
```

`GET /health` expone únicamente vida y versión. `GET /ready` comprueba la dependencia de contenido sin publicar detalles internos. Los diagnósticos de IA requieren `DIAGNOSTIC_TOKEN`.
