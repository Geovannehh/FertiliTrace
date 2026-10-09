import { env } from "cloudflare:workers";
import {
  initialLedger,
  applyCommand,
  DomainError,
  type Ledger,
  type Snapshot,
} from "@/domain/ledger";
type Row = { revision: number; payload: string };
function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db)
    throw new DomainError("Banco de dados indisponível. Tente novamente.", 503);
  return db;
}
export async function loadLedger(): Promise<Snapshot> {
  const db = database();
  let row = await db
    .prepare("SELECT revision,payload FROM fertili_ledgers WHERE id = ?")
    .bind("main")
    .first<Row>();
  if (!row) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO fertili_ledgers (id,revision,payload) VALUES (?,?,?)",
      )
      .bind("main", 0, JSON.stringify(initialLedger()))
      .run();
    row = await db
      .prepare("SELECT revision,payload FROM fertili_ledgers WHERE id = ?")
      .bind("main")
      .first<Row>();
  }
  if (!row) throw new DomainError("Não foi possível carregar a operação.", 503);
  return { version: row.revision, data: JSON.parse(row.payload) as Ledger };
}
export async function saveCommand(
  version: number,
  command: unknown,
  operator: string,
): Promise<Snapshot> {
  const current = await loadLedger();
  if (current.version !== version)
    throw new DomainError(
      "A operação foi atualizada em outra sessão. Atualize a página e tente novamente.",
      409,
    );
  const next = applyCommand(current.data, command, operator);
  if (next === current.data) return current;
  const saved = await database()
    .prepare(
      "UPDATE fertili_ledgers SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
    )
    .bind(JSON.stringify(next), "main", version)
    .run();
  if (saved.meta.changes !== 1)
    throw new DomainError(
      "Outro registro foi salvo agora. Atualize e tente novamente.",
      409,
    );
  return { version: version + 1, data: next };
}
