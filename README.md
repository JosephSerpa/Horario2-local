# Horario2 (SQLite local)

Proyecto React + Express con persistencia local en SQLite, guardada dentro del repositorio.

## Requisitos

- Node.js 20+

## Ejecutar en local

1. Instalar dependencias:
   `npm install`
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
