-- Nombre original del fichero subido (adjuntos del campo "Archivos y multimedia").
-- Nullable: las portadas ya subidas no tienen nombre y no lo necesitan.
ALTER TABLE "Asset" ADD COLUMN "name" TEXT;
