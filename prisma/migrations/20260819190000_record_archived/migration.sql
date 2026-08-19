-- Borrado reversible de filas: borrar deja de ser definitivo y se puede deshacer.
-- Las filas archivadas dejan de verse en vistas, cálculos, exportaciones y API.
ALTER TABLE "Record" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Record_collectionId_archivedAt_idx" ON "Record"("collectionId", "archivedAt");
