import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  initialLedger,
  stats,
  stockAt,
  alerts,
  applyCommand,
  parseTons,
  DomainError,
  type Ledger,
  type Command,
} from "../domain/ledger";
const seed = () => initialLedger(new Date("2026-10-08T14:00:00Z"));
const act = (
  s: Ledger,
  command: Omit<Command, "requestId"> | Record<string, unknown>,
) =>
  applyCommand(
    s,
    { ...command, requestId: randomUUID() },
    "Teste",
    "2026-10-08T14:00:00Z",
  );
test("balances count only external receipts and truck shipments", () => {
  const s = seed();
  assert.deepEqual(stats(s), {
    incoming: 9800000,
    outgoing: 2580000,
    stock: 7220000,
    alerts: 2,
  });
  assert.equal(stockAt(s, "B04"), 40000);
  assert.equal(s.movements.filter((m) => m.lotId === "LOT-004").length, 6);
});
test("remaining stock is not a discrepancy without a physical measurement", () => {
  const s = seed();
  s.counts = [];
  assert.equal(stockAt(s, "B04"), 40000);
  assert.equal(alerts(s).length, 0);
  const counted = act(s, {
    type: "count",
    locationId: "B04",
    actualKg: 0,
    note: "Medição física",
  });
  assert.equal(alerts(counted)[0].differenceKg, -40000);
  assert.equal(stockAt(counted, "B04"), 40000);
});
test("tonnes preserve kilogram precision and reject ambiguous input", () => {
  assert.equal(parseTons("1250,123"), 1250123);
  assert.equal(parseTons("0.001"), 1);
  for (const text of ["-1", "1.2345", "1.250,00", "1e3", "NaN", ""])
    assert.throws(() => parseTons(text), DomainError);
});
test("reject overspending, skipped stages, mixed products and capacity overflow", () => {
  const s = seed(),
    move = {
      type: "move",
      lotId: "LOT-004",
      from: "B04",
      to: "truck",
      quantityKg: 40001,
      reference: "NF-teste",
      note: "",
    };
  assert.throws(() => act(s, move), /Saldo insuficiente/);
  assert.throws(
    () => act(s, { ...move, from: "B04", to: "ship", quantityKg: 1000 }),
    /próxima etapa/,
  );
  assert.throws(
    () => act(s, { ...move, to: "B01", quantityKg: 1000 }),
    /outro produto/,
  );
  const full = seed();
  full.locations.find((l) => l.id === "B05")!.capacityKg = 999;
  assert.throws(
    () => act(full, { ...move, to: "B05", quantityKg: 1000 }),
    /capacidade/,
  );
  assert.equal(s.movements.length, 24);
  assert.equal(stockAt(s, "B04"), 40000);
});
test("internal transfers conserve stock and can combine lots of the same product", () => {
  const s = act(seed(), {
    type: "move",
    lotId: "LOT-004",
    from: "B04",
    to: "B02",
    quantityKg: 40000,
    reference: "TR-01",
    note: "",
  });
  assert.equal(stats(s).stock, 7220000);
  assert.equal(stockAt(s, "B04"), 0);
  assert.equal(stockAt(s, "B02"), 3160000);
});
test("same request is idempotent; invalid quantities never create movements", () => {
  const s = seed(),
    cmd = {
      type: "move",
      requestId: randomUUID(),
      lotId: "LOT-004",
      from: "B04",
      to: "truck",
      quantityKg: 1000,
      reference: "NF-1",
      note: "",
    };
  const saved = applyCommand(s, cmd, "Teste");
  assert.equal(applyCommand(saved, cmd, "Teste"), saved);
  assert.equal(stockAt(saved, "B04"), 39000);
  for (const n of [0, -1, 0.5, Infinity])
    assert.throws(() => act(s, { ...cmd, quantityKg: n }), DomainError);
});
test("only the most recently appended measurement per box can create an active alert", () => {
  const s = act(seed(), {
    type: "count",
    locationId: "B04",
    actualKg: 0,
    note: "Primeira contagem",
  });
  const updated = act(s, {
    type: "count",
    locationId: "B04",
    actualKg: 40000,
    note: "Contagem corrigida",
  });
  assert.equal(
    alerts(updated).some((c) => c.locationId === "B04"),
    false,
  );
  assert.equal(updated.counts.length, 6);
});
test("resolution preserves the measurement and the stock ledger", () => {
  const s = act(seed(), {
    type: "acknowledge",
    countId: "COUNT-B04",
    note: "Documento conferido; apuração registrada",
  });
  assert.equal(alerts(s).length, 1);
  assert.equal(
    s.counts.find((c) => c.id === "COUNT-B04")?.differenceKg,
    -40000,
  );
  assert.equal(stockAt(s, "B04"), 40000);
  assert.ok(s.counts.find((c) => c.id === "COUNT-B04")?.acknowledgedAt);
  assert.throws(
    () =>
      act(s, {
        type: "acknowledge",
        countId: "COUNT-B04",
        note: "Segunda tratativa",
      }),
    /já foi tratado/,
  );
});
test("either absolute or percentage threshold can trigger an alert", () => {
  const s = act(seed(), { type: "settings", absoluteKg: 100000, percent: 2 });
  assert.equal(alerts(s).length, 1);
  const zero = act(seed(), {
    type: "count",
    locationId: "B05",
    actualKg: 1000,
    note: "Produto encontrado",
  });
  assert.equal(
    alerts(zero).some((c) => c.locationId === "B05"),
    true,
  );
});
test("new arrivals traverse all stages and retain lot references", () => {
  let s = act(seed(), {
    type: "arrival",
    productId: "ammonium",
    vessel: "Navio Teste",
    reference: "BL-teste",
    quantityKg: 100000,
    note: "",
  });
  const lot = s.lots.at(-1)!;
  assert.equal(stockAt(s, "ship", lot.id), 100000);
  const path = ["ship", "unload", "conveyor", "warehouse", "B05", "truck"];
  for (let i = 0; i < path.length - 1; i++)
    s = act(s, {
      type: "move",
      lotId: lot.id,
      from: path[i],
      to: path[i + 1],
      quantityKg: 100000,
      reference: "Doc-" + i,
      note: "",
    });
  assert.equal(s.movements.filter((m) => m.lotId === lot.id).length, 6);
  assert.equal(stockAt(s, "truck", lot.id), 100000);
  assert.equal(stats(s).stock, 7220000);
});
