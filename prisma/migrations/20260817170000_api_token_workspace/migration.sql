-- ApiToken scopeado a workspace. Los tokens previos no tienen workspace y no pueden
-- funcionar con el nuevo esquema: se eliminan para poder añadir la columna NOT NULL.
DELETE FROM "ApiToken";
ALTER TABLE "ApiToken" ADD COLUMN "workspaceId" TEXT NOT NULL;
ALTER TABLE "ApiToken" ADD COLUMN "createdById" TEXT;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ApiToken_workspaceId_idx" ON "ApiToken"("workspaceId");
