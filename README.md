# ¿Te animás? — Dirección adaptativa 1.7.0

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
