-- Permisos por página: Page.restricted corta la herencia y PagePermission dice
-- quién entra (y con qué nivel) en la página restringida más cercana del camino.
ALTER TABLE "Page" ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PagePermission" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "PagePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PagePermission_pageId_userId_key" ON "PagePermission"("pageId", "userId");
CREATE INDEX "PagePermission_userId_idx" ON "PagePermission"("userId");

ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
