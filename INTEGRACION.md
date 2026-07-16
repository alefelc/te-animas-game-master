# Integración game-master v1.4.0

El servicio debe recibir siempre `usedCardIds`, `completedCardIds`, `skippedCardIds`, filtros, juguetes y elementos seleccionados. La respuesta debe incluir:

```json
{"cardId":"...","source":"ai","requestId":"..."}
```

Reglas obligatorias:

1. Nunca devolver un `cardId` incluido en `usedCardIds`.
2. Validar que el ID pertenezca al conjunto elegible calculado por el servidor.
3. Si OpenAI falla, devolver HTTP 503 o una selección de política con `source: "policy_fallback"`; no ordenar al cliente cambiar de modo.
4. El frontend decide un fallback local temporal y vuelve a intentar IA en la carta siguiente.
5. Registrar `requestId`, estado HTTP, latencia y `source`, sin registrar textos íntimos completos.
6. Exponer `/health` sin dependencia de OpenAI y `/ready` verificando Directus; una caída de `/ready` no debe sobrescribir preferencias de usuario.
