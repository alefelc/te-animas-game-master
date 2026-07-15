# Corrección EasyPanel v1.0.2

## Error corregido

`COPY .npmrc package*.json ./` fallaba porque `.npmrc` no estaba en GitHub.

## Solución

- El Dockerfile ya no depende de `.npmrc`.
- El registro público de npm y los reintentos se configuran dentro del Dockerfile.
- Las dependencias se instalan una sola vez.
- Se conserva el código compilado en `dist`.

Reemplazá completamente el repositorio con este paquete y ejecutá
Deploy/Rebuild sin caché.
