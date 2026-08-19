-- Webhooks salientes: avisan a un servicio propio (p. ej. el asistente del NAS)
-- cuando cambia una fila. El secreto firma cada envío (HMAC-SHA256).
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT 'record.created,record.updated,record.deleted',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Webhook_workspaceId_idx" ON "Webhook"("workspaceId");
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
