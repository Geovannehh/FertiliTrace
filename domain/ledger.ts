import { z } from "zod";
export type Nutrient = "N" | "P" | "K";
export type Product = {
  id: string;
  name: string;
  nutrient: Nutrient;
  formula: string;
};
export type Location = {
  id: string;
  name: string;
  stage: number;
  capacityKg: number;
  warehouse?: string;
};
export type Lot = {
  id: string;
  code: string;
  productId: string;
  vessel: string;
  reference: string;
  createdAt: string;
};
export type Movement = {
  id: string;
  lotId: string;
  from: string;
  to: string;
  quantityKg: number;
  reference: string;
  note: string;
  operator: string;
  createdAt: string;
};
export type Count = {
  id: string;
  locationId: string;
  expectedKg: number;
  actualKg: number;
  differenceKg: number;
  note: string;
  createdAt: string;
  operator: string;
  acknowledgedAt?: string;
  resolution?: string;
};
export type Ledger = {
  products: Product[];
  locations: Location[];
  lots: Lot[];
  movements: Movement[];
  counts: Count[];
  applied: string[];
  settings: { absoluteKg: number; percent: number };
  demo: boolean;
};
export type Snapshot = { version: number; data: Ledger };
const text = z.string().trim().min(1).max(160),
  kg = z.number().int().positive().max(2_000_000_000),
  base = { requestId: z.string().uuid() };
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("arrival"),
      productId: text,
      vessel: text,
      reference: text,
      quantityKg: kg,
      note: z.string().max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("move"),
      lotId: text,
      from: text,
      to: text,
      quantityKg: kg,
      reference: text,
      note: z.string().max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("count"),
      locationId: text,
      actualKg: z.number().int().nonnegative().max(2_000_000_000),
      note: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("acknowledge"),
      countId: text,
      note: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("settings"),
      absoluteKg: kg,
      percent: z.number().min(0.1).max(100),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export function tons(kg: number, decimals = 1) {
  return (kg / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
export function parseTons(text: string) {
  const s = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s))
    throw new DomainError("Informe toneladas com até três casas decimais.");
  const n = Math.round(Number(s) * 1000);
  if (!Number.isSafeInteger(n) || n > 2_000_000_000)
    throw new DomainError("Quantidade acima do limite.");
  return n;
}
export function stockAt(state: Ledger, locationId: string, lotId?: string) {
  return state.movements
    .filter((m) => !lotId || m.lotId === lotId)
    .reduce(
      (n, m) =>
        n +
        (m.to === locationId ? m.quantityKg : 0) -
        (m.from === locationId ? m.quantityKg : 0),
      0,
    );
}
export function productAt(state: Ledger, locationId: string) {
  const lot = state.lots.find((l) => stockAt(state, locationId, l.id) > 0);
  return state.products.find((p) => p.id === lot?.productId);
}
export function canTransfer(from: Location, to: Location) {
  return (
    from.id !== to.id &&
    (to.stage === from.stage + 1 || (from.stage === 5 && to.stage === 5))
  );
}
export function countPercent(c: Count) {
  return c.expectedKg > 0
    ? (Math.abs(c.differenceKg) / c.expectedKg) * 100
    : c.differenceKg === 0
      ? 0
      : 100;
}
export function isAlert(c: Count, settings: Ledger["settings"]) {
  return (
    Math.abs(c.differenceKg) >= settings.absoluteKg ||
    countPercent(c) >= settings.percent
  );
}
export function alerts(state: Ledger) {
  const latest = new Map<string, Count>();
  for (const count of state.counts) latest.set(count.locationId, count);
  return [...latest.values()].filter(
    (c) => !c.acknowledgedAt && isAlert(c, state.settings),
  );
}
export function stats(state: Ledger) {
  const incoming = state.movements
      .filter((m) => m.from === "external")
      .reduce((n, m) => n + m.quantityKg, 0),
    outgoing = state.movements
      .filter((m) => m.to === "truck")
      .reduce((n, m) => n + m.quantityKg, 0);
  return {
    incoming,
    outgoing,
    stock: incoming - outgoing,
    alerts: alerts(state).length,
  };
}
export function applyCommand(
  state: Ledger,
  raw: unknown,
  operator: string,
  now = new Date().toISOString(),
): Ledger {
  const result = commandSchema.safeParse(raw);
  if (!result.success)
    throw new DomainError("Verifique os campos obrigatórios e as quantidades.");
  const c = result.data;
  if (state.applied.includes(c.requestId)) return state;
  if (state.movements.length >= 20000)
    throw new DomainError(
      "Limite do MVP atingido. Exporte os dados para ampliar a base.",
    );
  const next = structuredClone(state);
  next.applied.push(c.requestId);
  if (c.type === "arrival") {
    if (!next.products.some((p) => p.id === c.productId))
      throw new DomainError("Produto não encontrado.");
    const lot: Lot = {
      id: c.requestId,
      code:
        "FT-" + now.slice(0, 4) + "-" + c.requestId.slice(0, 6).toUpperCase(),
      productId: c.productId,
      vessel: c.vessel,
      reference: c.reference,
      createdAt: now,
    };
    next.lots.push(lot);
    next.movements.push({
      id: c.requestId + "-arrival",
      lotId: lot.id,
      from: "external",
      to: "ship",
      quantityKg: c.quantityKg,
      reference: c.reference,
      note: c.note,
      operator,
      createdAt: now,
    });
  }
  if (c.type === "move") {
    const lot = next.lots.find((l) => l.id === c.lotId),
      from = next.locations.find((l) => l.id === c.from),
      to = next.locations.find((l) => l.id === c.to);
    if (!lot || !from || !to)
      throw new DomainError("Lote ou local não encontrado.");
    if (!canTransfer(from, to))
      throw new DomainError(
        "Use a próxima etapa do fluxo ou uma transferência entre boxes.",
      );
    if (stockAt(next, from.id, lot.id) < c.quantityKg)
      throw new DomainError("Saldo insuficiente na origem para este lote.");
    if (to.capacityKg && stockAt(next, to.id) + c.quantityKg > to.capacityKg)
      throw new DomainError("A movimentação excede a capacidade do box.");
    const existing = productAt(next, to.id);
    if (to.stage === 5 && existing && existing.id !== lot.productId)
      throw new DomainError(
        "O box já contém outro produto. Selecione um box compatível ou vazio.",
      );
    next.movements.push({
      id: c.requestId,
      lotId: c.lotId,
      from: c.from,
      to: c.to,
      quantityKg: c.quantityKg,
      reference: c.reference,
      note: c.note,
      operator,
      createdAt: now,
    });
  }
  if (c.type === "count") {
    const location = next.locations.find((l) => l.id === c.locationId);
    if (location?.stage !== 5)
      throw new DomainError("Selecione um box para conciliação.");
    if (c.actualKg > location.capacityKg)
      throw new DomainError("O estoque medido excede a capacidade do box.");
    const expected = stockAt(next, c.locationId);
    next.counts.push({
      id: c.requestId,
      locationId: c.locationId,
      expectedKg: expected,
      actualKg: c.actualKg,
      differenceKg: c.actualKg - expected,
      note: c.note,
      createdAt: now,
      operator,
    });
  }
  if (c.type === "acknowledge") {
    const count = next.counts.find((n) => n.id === c.countId);
    if (!count) throw new DomainError("Conciliação não encontrada.");
    if (count.acknowledgedAt) throw new DomainError("O alerta já foi tratado.");
    count.acknowledgedAt = now;
    count.resolution = c.note;
  }
  if (c.type === "settings")
    next.settings = { absoluteKg: c.absoluteKg, percent: c.percent };
  if (new TextEncoder().encode(JSON.stringify(next)).length > 1_500_000)
    throw new DomainError(
      "A base atingiu o limite do MVP. Exporte os registros e amplie o armazenamento.",
      413,
    );
  return next;
}
export function initialLedger(now = new Date()): Ledger {
  const products: Product[] = [
    { id: "urea", name: "Ureia", nutrient: "N", formula: "Nitrogenado" },
    {
      id: "map",
      name: "MAP",
      nutrient: "P",
      formula: "Fosfato monoamônico · N + P",
    },
    {
      id: "kcl",
      name: "Cloreto de potássio",
      nutrient: "K",
      formula: "Potássico",
    },
    {
      id: "ammonium",
      name: "Sulfato de amônio",
      nutrient: "N",
      formula: "Nitrogenado",
    },
  ];
  const locations: Location[] = [
    { id: "ship", name: "Navio", stage: 1, capacityKg: 0 },
    { id: "unload", name: "Descarga", stage: 2, capacityKg: 0 },
    { id: "conveyor", name: "Transportador", stage: 3, capacityKg: 0 },
    { id: "warehouse", name: "Armazém", stage: 4, capacityKg: 0 },
    ...["B01", "B02", "B03", "B04", "B05", "B06"].map((id, i) => ({
      id,
      name: id,
      stage: 5,
      capacityKg: [4000000, 4500000, 2500000, 1800000, 2000000, 3000000][i],
      warehouse: i < 4 ? "Armazém A" : "Armazém B",
    })),
    { id: "truck", name: "Caminhão", stage: 6, capacityKg: 0 },
  ];
  const state: Ledger = {
    products,
    locations,
    lots: [],
    movements: [],
    counts: [],
    applied: [],
    settings: { absoluteKg: 10000, percent: 2 },
    demo: true,
  };
  const seeds = [
    {
      id: "LOT-001",
      product: "urea",
      quantity: 3600000,
      out: 480000,
      box: "B02",
      vessel: "M/V Atlantic Star",
      offset: 6,
    },
    {
      id: "LOT-002",
      product: "kcl",
      quantity: 3050000,
      out: 630000,
      box: "B01",
      vessel: "M/V Ocean Pioneer",
      offset: 5,
    },
    {
      id: "LOT-003",
      product: "map",
      quantity: 1900000,
      out: 260000,
      box: "B03",
      vessel: "M/V Atlantic Star",
      offset: 3,
    },
    {
      id: "LOT-004",
      product: "urea",
      quantity: 1250000,
      out: 1210000,
      box: "B04",
      vessel: "M/V North Bay",
      offset: 1,
    },
  ];
  for (const seed of seeds) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - seed.offset);
    d.setUTCHours(10, 0, 0, 0);
    const date = d.toISOString(),
      lot: Lot = {
        id: seed.id,
        code: "FT-2026-" + seed.id.slice(-3),
        productId: seed.product,
        vessel: seed.vessel,
        reference: "BL-260" + seed.id.slice(-1),
        createdAt: date,
      };
    state.lots.push(lot);
    const path = [
      "external",
      "ship",
      "unload",
      "conveyor",
      "warehouse",
      seed.box,
      "truck",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const at = new Date(d.getTime() + i * 3600000).toISOString();
      state.movements.push({
        id: seed.id + "-" + i,
        lotId: lot.id,
        from: path[i],
        to: path[i + 1],
        quantityKg: i === 5 ? seed.out : seed.quantity,
        reference: i === 5 ? "NF-00" + seed.id.slice(-1) : lot.reference,
        note:
          i === 5
            ? "Expedição de demonstração · veículo fictício"
            : "Registro de demonstração",
        operator: "Operação de exemplo",
        createdAt: at,
      });
    }
  }
  for (const [box, actual, note] of [
    ["B01", 2418000, "Conferência de rotina"],
    ["B02", 3118000, "Conferência de rotina"],
    ["B03", 1622000, "Diferença entre saldo contábil e medição física"],
    ["B04", 0, "Após expedição, medição indica box vazio"],
  ] as const) {
    const expected = stockAt(state, box);
    state.counts.push({
      id: "COUNT-" + box,
      locationId: box,
      expectedKg: expected,
      actualKg: actual,
      differenceKg: actual - expected,
      note,
      operator: "Operação de exemplo",
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
    });
  }
  return state;
}
