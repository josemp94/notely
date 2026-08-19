-- Recordatorios de fecha en la bandeja.
-- "key" identifica el aviso (p. ej. due:<recordId>:<fecha>) para no repetirlo;
-- en Postgres los NULL no colisionan, así que las notificaciones sin key conviven.
ALTER TABLE "Notification" ADD COLUMN "key" TEXT;
ALTER TABLE "Notification" ADD COLUMN "title" TEXT;
CREATE UNIQUE INDEX "Notification_userId_key_key" ON "Notification"("userId", "key");
