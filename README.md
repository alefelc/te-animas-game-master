# ¿Te animás? — Game Master API 1.10.0 R20

API de dirección adaptativa y backend privado para cuentas/perfiles.

## Cuentas y perfiles

- `POST /v1/account/register` recibe nombre, apellido y email.
- El servidor usa su token privado para solicitar una invitación nativa a Directus.
- La persona define su contraseña desde el enlace recibido.
- Las rutas `/v1/account/me` y `/v1/account/profile` validan el token de sesión del jugador.
- El navegador nunca accede directamente a `pc_user_profiles`.

## Variables nuevas

```env
PLAYER_ROLE_ID=
ACCOUNT_INVITE_URL=https://teanimas.com/?auth=accept-invite
REGISTER_RATE_LIMIT_PER_MINUTE=3
```

`PLAYER_ROLE_ID` se genera con el instalador `directus-auth-r19`.

`DIRECTUS_TOKEN` es privado y debe existir solamente en el servicio Game Master. No debe incluirse en el frontend ni en el repositorio.


## Selección R20

Cada candidata puede informar sus elementos, juguetes y prácticas. La API prioriza el inventario elegido, conserva la penalización de cartas vistas y favorece penetración disponible durante el pico sin reintroducir cartas que el frontend haya excluido.

## Build

```sh
npm ci
npm test -- --run
npm run build
```

## Salud

`GET /health` debe informar `api_version: 1.10.0`.
