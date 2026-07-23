REPOSITORIO: game-master
RELEASE: 5.0.0-r3

1. Elimine TODO el contenido actual del repositorio.
2. Extraiga este ZIP en su PC.
3. Suba a la RAÍZ exactamente estos cuatro archivos:
   - Dockerfile
   - source.tar.gz
   - .dockerignore
   - README-SUBIR-A-GITHUB.txt
4. No extraiga source.tar.gz.
5. En EasyPanel use Dockerfile = Dockerfile y contexto = raíz.
6. El log debe indicar un contexto cercano a 125 KB, nunca menos de 1 KB.
7. OPENAI_API_KEY, DIRECTUS_TOKEN y demás secretos deben ser variables de entorno, no Build Args.
