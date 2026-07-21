# ¿Te animás? — Game Master para EasyPanel

Este directorio es un repositorio autónomo. Subí **su contenido** a la raíz del repositorio conectado al servicio `game-master`.

## EasyPanel

- Build method: Dockerfile
- Dockerfile: `Dockerfile`
- Build context: raíz del repositorio (`.`)
- Puerto: `3000`
- Healthcheck: `/ready`

Las credenciales y tokens deben configurarse como variables de entorno de ejecución, no como build arguments.
