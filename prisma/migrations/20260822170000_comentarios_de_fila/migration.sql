-- Comentarios anclados a una fila de una base de datos. El comentario sigue
-- colgando de la página (permisos y listados de página intactos: los de página
-- llevan recordId NULL); recordId dice de qué fila es y cae en cascada con ella.
ALTER TABLE "Comment" ADD COLUMN "recordId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Comment_recordId_idx" ON "Comment"("recordId");
