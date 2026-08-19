-- Plantillas de fila de una base de datos: [{ id, name, cells }].
-- Viven en la colección (no son registros) para que no aparezcan como filas.
ALTER TABLE "Collection" ADD COLUMN "templates" JSONB NOT NULL DEFAULT '[]'::jsonb;
