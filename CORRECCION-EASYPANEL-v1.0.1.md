# Corrección EasyPanel v1.0.1

## Causa del error

El `package-lock.json` anterior contenía enlaces hacia un registro privado usado
durante la generación del paquete. EasyPanel intentaba conectarse a una dirección
interna y terminaba con `ETIMEDOUT`.

Además, el Dockerfile instalaba las dependencias dos veces.

## Cambios

- Todos los paquetes apuntan a `https://registry.npmjs.org/`.
- Se agregó `.npmrc` con reintentos.
- Las dependencias se instalan una sola vez.
- Se usa el código ya compilado de `dist`.
- `dist` ya no está excluido por `.dockerignore`.

## Publicación

Reemplazá completamente los archivos del repositorio con este paquete, hacé
commit y ejecutá Deploy/Rebuild sin caché.

Variables:

```env
OPENAI_MODEL=gpt-5.6
PORT=3000
```

Las credenciales deben configurarse nuevamente después de revocar las que
aparecieron en el registro compartido.
