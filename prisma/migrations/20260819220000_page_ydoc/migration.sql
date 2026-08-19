-- Edición simultánea: estado Yjs del documento de la página.
-- Page.content sigue siendo la fuente para todo lo demás (búsqueda, publicación,
-- exportación, versiones): el servidor de colaboración lo reescribe al guardar.
ALTER TABLE "Page" ADD COLUMN "ydoc" BYTEA;
