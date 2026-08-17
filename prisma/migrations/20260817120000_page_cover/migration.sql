-- Portada de página ("gradient:<id>" preset o "url:<imagen>")
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "cover" TEXT;
