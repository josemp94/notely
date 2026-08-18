-- Preferencia por página: el contenido ocupa todo el ancho (como "Ancho completo" de Notion)
ALTER TABLE "Page" ADD COLUMN "fullWidth" BOOLEAN NOT NULL DEFAULT false;
