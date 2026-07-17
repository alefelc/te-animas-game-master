# Corrección de compilación r5

El despliegue fallaba porque el repositorio remoto conservaba archivos viejos del frontend dentro de `src/`.
Subir una carpeta nueva desde la interfaz web de GitHub reemplaza archivos coincidentes, pero no elimina archivos anteriores.

La API 1.8.1 incorpora tres defensas:

1. `Dockerfile` copia únicamente `src/*.ts` y no subcarpetas antiguas.
2. `tsconfig.json` compila únicamente los archivos TypeScript planos de la API.
3. `.dockerignore` excluye explícitamente las carpetas antiguas del frontend.

Por ello, el build no vuelve a contaminarse aunque todavía existan en el repositorio carpetas como:

- `src/api`
- `src/components`
- `src/db`
- `src/engine`
- `src/screens`
- `src/store`

Igualmente conviene eliminarlas del repositorio para no seguir mezclando dos aplicaciones distintas.
