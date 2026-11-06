# Extra topics

This file contains some extra topics that are helpful for development.

## 1. Databases and migrations

The API uses one database: postgresql (with prisma). MongoDB was retired in v0.6.0 (see
[postgres-port.md](./postgres-port.md)); the scripts in `/migrations` up to `11-mongo-to-pg` are the history of that move.

Before starting the app: deploy the new migrations using `npm run migration:deploy`.

Changing database models: create a migration using `npm run migration:create` and deploy it using `npm run migration:deploy`.

Creating a data migration: create a blank migration using `npm run migration:create` and fill it with your SQL script.
