-- ID incremental por colección (tipo de campo "id")
ALTER TABLE "Record" ADD COLUMN "seq" INTEGER;
UPDATE "Record" r SET "seq" = sub.rn FROM (SELECT id, row_number() OVER (PARTITION BY "collectionId" ORDER BY "createdAt", id) AS rn FROM "Record") sub WHERE r.id = sub.id;
