# Horario2 (SQLite local)

Proyecto React + Express con persistencia local en SQLite, guardada dentro del repositorio.

## Requisitos

- Node.js 20+

## Ejecutar en local

1. Instalar dependencias:
   `npm install`
2. Configurar variables de entorno:
   - Copiar `.env.example` a `.env`
   - Definir `ADMIN_USERNAME` y `ADMIN_PASSWORD`
3. Ejecutar el servidor (frontend + API):
   `npm run dev`
4. Abrir en navegador:
   `http://localhost:3000`

## Seguridad (resumen)

- Login admin validado en backend con sesion por cookie `HttpOnly`.
- API de escritura protegida por autenticacion + token CSRF.
- Cabeceras HTTP de seguridad (CSP, HSTS en produccion, `X-Frame-Options`, etc.).
- Validacion y saneo de payloads para horarios, cursos y registros diarios.
- Limites de tamano/rate-limit para reducir abuso.
- Registros diarios restringidos a imagenes `jpeg/jpg/png/webp` en Data URL.

## Ejecutar en local (modo rapido)

1. `npm install`
2. Ejecutar el servidor (frontend + API):
   `npm run dev`
3. Abrir en navegador:
   `http://localhost:3000`

## Base de datos local

- Archivo SQLite: `data/horario.db`
- API usada por el frontend:
  - `GET /api/data`
  - `PUT /api/data`
- En el primer arranque se inicializa con `src/data.json` si la BD no existe.

## Migrar a otra PC

1. Subir cambios al repo (incluyendo `data/horario.db` si quieres llevar los datos actuales).
2. Clonar en la otra PC.
3. Ejecutar `npm install` y luego `npm run dev`.

Si no subes `data/horario.db`, el sistema crea una nueva BD desde `src/data.json`.
