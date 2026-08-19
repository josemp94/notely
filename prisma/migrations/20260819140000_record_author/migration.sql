-- Autor de la fila, para los tipos de campo "Creado por" y "Editado por".
-- Sin FK a propósito (como Asset.createdById): si algún día se borra un usuario,
-- la fila sobrevive con un id colgando y la UI lo muestra como desconocido.
ALTER TABLE "Record" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Record" ADD COLUMN "updatedById" TEXT;
