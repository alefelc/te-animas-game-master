# ¿Te animás? — Game Master API v1.0.0

Servicio privado que dirige la partida y elige una carta entre las candidatas que ya superaron todos los límites del juego.

## Qué hace

- Recibe únicamente cartas válidas para la configuración actual.
- Analiza ritmo, intensidad, continuidad, turnos y reacciones.
- Devuelve una sola carta existente.
- Guarda eventos y decisiones en las colecciones `pc_ai_*`.
- Si OpenAI no responde, utiliza una selección adaptativa local; la partida no se bloquea.

## Variables

Copiar `.env.example` como `.env` y completar:

- `OPENAI_API_KEY`
- `DIRECTUS_URL`
- `DIRECTUS_TOKEN`
- `ALLOWED_ORIGINS=https://census.ar`

La clave de OpenAI y el token administrativo nunca van en el frontend.

## Desarrollo

```bash
npm install
npm run dev
```

## Producción

```bash
npm run build
npm start
```

El contenedor escucha en el puerto `3000` y expone:

- `GET /health`
- `POST /v1/game-master/next`
