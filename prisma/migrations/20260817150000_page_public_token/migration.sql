-- Publicar en la web: token url-safe; si no es NULL, la página es pública en /s/<token>
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Page_publicToken_key" ON "Page"("publicToken");
