type Db = typeof import("@/lib/db").db;

/**
 * Relaciones: mantenimiento del campo espejo (bidireccional) y limpieza de
 * referencias al borrar filas del todo. Compartido por tRPC y la API REST.
 */

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/**
 * Tras cambiar una celda de relación con espejo de `antes` a `despues`, añade o
 * quita este registro en el campo espejo de las filas destino afectadas.
 * El update es por clave (jsonb ||), como el resto de escrituras de celda.
 */
export async function sincronizaEspejo(
  db: Db,
  recordId: string,
  mirrorFieldId: string,
  antes: unknown,
  despues: unknown,
): Promise<void> {
  const antesIds = ids(antes);
  const despuesIds = ids(despues);
  const cambios: [string, boolean][] = [
    ...despuesIds.filter((x) => !antesIds.includes(x)).map((x): [string, boolean] => [x, true]),
    ...antesIds.filter((x) => !despuesIds.includes(x)).map((x): [string, boolean] => [x, false]),
  ];
  for (const [targetId, añadir] of cambios) {
    const t = await db.record.findUnique({ where: { id: targetId }, select: { cells: true } });
    if (!t) continue;
    const lista = ids((t.cells as Record<string, unknown>)[mirrorFieldId]);
    const nueva = añadir
      ? lista.includes(recordId)
        ? null
        : [...lista, recordId]
      : lista.includes(recordId)
        ? lista.filter((x) => x !== recordId)
        : null;
    if (nueva === null) continue; // ya estaba como debía
    await db.$executeRaw`UPDATE "Record" SET cells = cells || ${JSON.stringify({ [mirrorFieldId]: nueva })}::jsonb WHERE id = ${targetId}`;
  }
}

/**
 * Al borrar filas PARA SIEMPRE, quita sus ids de todas las celdas de relación que
 * apuntaban a su colección: sin esto quedan referencias colgantes que cuentan en
 * los rollups. (El borrado reversible no limpia: restaurar recupera los enlaces.)
 */
export async function limpiaReferencias(db: Db, collectionId: string, recordIds: string[]): Promise<void> {
  if (!recordIds.length) return;
  // ponytail: se leen todos los campos relation y se filtra en JS por config; son
  // pocos. Si algún día hay miles, índice sobre config->targetCollectionId.
  const campos = await db.field.findMany({
    where: { type: "relation" },
    select: { id: true, collectionId: true, config: true },
  });
  const apuntan = campos.filter(
    (f) => (f.config as { targetCollectionId?: string })?.targetCollectionId === collectionId,
  );
  for (const f of apuntan) {
    for (const rid of recordIds) {
      const afectados = await db.record.findMany({
        where: { collectionId: f.collectionId, cells: { path: [f.id], array_contains: rid } },
        select: { id: true, cells: true },
      });
      for (const r of afectados) {
        const lista = ids((r.cells as Record<string, unknown>)[f.id]).filter((x) => x !== rid);
        await db.$executeRaw`UPDATE "Record" SET cells = cells || ${JSON.stringify({ [f.id]: lista })}::jsonb WHERE id = ${r.id}`;
      }
    }
  }
}
