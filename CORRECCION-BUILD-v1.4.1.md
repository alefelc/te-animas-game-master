# Corrección de build v1.4.1

La versión anterior contenía en `package-lock.json` direcciones de un registro privado inaccesible desde EasyPanel. Por eso `npm ci` intentaba conectarse a un host interno y terminaba con `ETIMEDOUT`.

Cambios:

- todas las dependencias apuntan a `https://registry.npmjs.org/`;
- Docker instala las dependencias una sola vez;
- el runtime copia `node_modules` desde la etapa de compilación;
- se agregaron reintentos y tiempos de espera razonables para npm;
- se mantiene el usuario no privilegiado `node`.

En EasyPanel deben conservarse las variables únicamente como variables de ejecución. No deben declararse como `ARG` dentro del Dockerfile.
