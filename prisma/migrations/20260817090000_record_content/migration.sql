-- Añade cuerpo de bloques a las filas de base de datos (fila = página)
/* AlterTable */
ALTER TABLE "Record" ADD COLUMN "content" JSONB;
