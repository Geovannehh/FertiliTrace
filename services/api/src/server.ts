import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  initialLedger,
  applyCommand,
  DomainError,
  type Ledger,
} from "../../../domain/ledger";
const prisma = new PrismaClient();
const token = process.env.API_TOKEN || "";
if (token.length < 32 || token.includes("replace"))
  throw new Error("Configure API_TOKEN com ao menos 32 caracteres aleatórios.");
function authenticated(header?: string) {
  const value = Buffer.from(header || ""),
    expected = Buffer.from("Bearer " + token);
  return value.length === expected.length && timingSafeEqual(value, expected);
}
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const respond = (status: number, payload: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(payload));
  };
  if (req.url === "/health" && req.method === "GET") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return respond(200, { status: "ok" });
    } catch {
      return respond(503, { error: "Banco indisponível" });
    }
  }
  if (req.url !== "/platform")
    return respond(404, { error: "Rota não encontrada" });
  if (!authenticated(req.headers.authorization))
    return respond(401, { error: "Acesso não autorizado" });
  try {
    await prisma.ledgerState.upsert({
      where: { id: "main" },
      update: {},
      create: {
        id: "main",
        revision: 0,
        payload: initialLedger() as unknown as Prisma.InputJsonValue,
      },
    });
    const current = await prisma.ledgerState.findUniqueOrThrow({
      where: { id: "main" },
    });
    const data = current.payload as unknown as Ledger;
    if (req.method === "GET")
      return respond(200, { version: current.revision, data });
    if (req.method !== "POST")
      return respond(405, { error: "Método não permitido" });
    let text = "";
    for await (const chunk of req) {
      text += chunk.toString();
      if (text.length > 10000)
        throw new DomainError("Registro muito grande.", 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new DomainError("JSON inválido.", 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("version" in body) ||
      typeof body.version !== "number" ||
      !Number.isInteger(body.version) ||
      body.version < 0 ||
      !("command" in body)
    )
      throw new DomainError("Versão inválida.");
    if (body.version !== current.revision)
      throw new DomainError(
        "A operação foi atualizada em outra sessão. Atualize e tente novamente.",
        409,
      );
    const next = applyCommand(data, body.command, "Operação local");
    if (next === data) return respond(200, { version: current.revision, data });
    const saved = await prisma.ledgerState.updateMany({
      where: { id: "main", revision: body.version },
      data: {
        revision: { increment: 1 },
        payload: next as unknown as Prisma.InputJsonValue,
      },
    });
    if (saved.count !== 1)
      throw new DomainError(
        "Outro registro foi salvo agora. Atualize e tente novamente.",
        409,
      );
    return respond(200, { version: body.version + 1, data: next });
  } catch (error) {
    if (error instanceof DomainError)
      return respond(error.status, { error: error.message });
    console.error(
      "API database boundary",
      error instanceof Error ? error.name : "unknown",
    );
    return respond(503, {
      error: "Não foi possível acessar os registros. Tente novamente.",
    });
  }
});
server.requestTimeout = 30000;
server.listen(Number(process.env.PORT || 8000), "0.0.0.0", () =>
  console.log("FertiliTrace API ready"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  }),
);
