-- Sub-elementos: auto-relación en Record; borrar un padre borra sus hijos en cascada
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Record" ADD CONSTRAINT "Record_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Record_parentId_idx" ON "Record"("parentId");
