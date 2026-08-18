-- Página contenedora oculta de una base de datos embebida en el cuerpo de otra página
ALTER TABLE "Page" ADD COLUMN "embedded" BOOLEAN NOT NULL DEFAULT false;
