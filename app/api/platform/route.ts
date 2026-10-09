import { loadLedger, saveCommand } from "@/server/ledger-store";
import { DomainError } from "@/domain/ledger";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
async function proxy(request: Request) {
  const base = process.env.FERTILI_API_URL;
  if (!base) return null;
  const token = process.env.API_TOKEN;
  if (!token)
    throw new DomainError("Configure o token da API no servidor.", 503);
  return fetch(base + "/platform", {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: request.method === "POST" ? await request.text() : undefined,
    signal: AbortSignal.timeout(15000),
  });
}
async function handler(request: Request) {
  try {
    const forwarded = await proxy(request);
    if (forwarded)
      return new Response(forwarded.body, {
        status: forwarded.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    const user = await getChatGPTUser();
    if (!user)
      return Response.json(
        { error: "Entre com sua conta para acessar a operação." },
        { status: 401 },
      );
    if (request.method === "GET")
      return Response.json(await loadLedger(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (Number(request.headers.get("content-length") || 0) > 10000)
      throw new DomainError("Registro muito grande.", 413);
    const content = await request.text();
    if (new TextEncoder().encode(content).length > 10000)
      throw new DomainError("Registro muito grande.", 413);
    let body: unknown;
    try {
      body = JSON.parse(content);
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
      throw new DomainError("Versão do registro inválida.");
    return Response.json(
      await saveCommand(body.version, body.command, user.displayName),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error(
      "FertiliTrace storage boundary",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "Não foi possível acessar os registros. Tente novamente." },
      { status: 503 },
    );
  }
}
export const GET = handler;
export const POST = handler;
