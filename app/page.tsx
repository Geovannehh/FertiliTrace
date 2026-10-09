"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Leaf,
  LayoutDashboard,
  ArrowRightLeft,
  Warehouse,
  Route,
  TriangleAlert,
  Settings2,
  Plus,
  ChevronRight,
  Search,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  Ship,
  Truck,
  Container,
  Boxes,
  Activity,
  CheckCheck,
  RefreshCw,
  LoaderCircle,
  ClipboardCheck,
  MapPin,
  Anchor,
  MoveRight,
  Info,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Toaster, toast } from "sonner";
import { OperationDialog, Picker } from "@/components/fertili/OperationDialog";
import {
  type Snapshot,
  type Command,
  type Count,
  type Movement,
  type Product,
  stats,
  alerts,
  stockAt,
  productAt,
  tons,
  countPercent,
  parseTons,
} from "@/domain/ledger";
const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "movements", label: "Movimentações", icon: ArrowRightLeft },
  { id: "boxes", label: "Armazéns e boxes", icon: Warehouse },
  { id: "trace", label: "Rastreabilidade", icon: Route },
  { id: "alerts", label: "Alertas", icon: TriangleAlert },
];
const stageIcons = [Ship, Container, Activity, Warehouse, Boxes, Truck];
function formatDate(s: string) {
  return new Date(s).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function Nutrient({ product }: { product?: Product }) {
  return product ? (
    <span className={"nutrient " + product.nutrient.toLowerCase()}>
      {product.nutrient}
    </span>
  ) : (
    <span className="nutrient empty">—</span>
  );
}
function OperationNavigation({
  view,
  alertCount,
  onNavigate,
}: {
  view: string;
  alertCount: number;
  onNavigate: (id: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav>
      {navigation.map((n) => (
        <button
          key={n.id}
          className={view === n.id ? "active" : ""}
          aria-current={view === n.id ? "page" : undefined}
          onClick={() => {
            onNavigate(n.id);
            setOpenMobile(false);
          }}
        >
          <n.icon size={20} />
          {n.label}
          {n.id === "alerts" && alertCount > 0 && (
            <span className="nav-badge">{alertCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
export default function FertiliTrace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [view, setView] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [dialog, setDialog] = useState(false),
    [dialogMode, setDialogMode] = useState("move"),
    [dialogBox, setDialogBox] = useState(""),
    [selectedBox, setSelectedBox] = useState(""),
    [traceLot, setTraceLot] = useState("LOT-004"),
    [resolve, setResolve] = useState<Count | null>(null),
    [resolution, setResolution] = useState(""),
    [saving, setSaving] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [limitT, setLimitT] = useState("10"),
    [limitPercent, setLimitPercent] = useState("2");
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/platform", { cache: "no-store" });
      const body = (await res.json()) as Snapshot & { error?: string };
      if (!res.ok)
        throw Error(body.error || "Não foi possível carregar a plataforma.");
      setSnapshot(body);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  async function save(command: Command) {
    if (!snapshot) return false;
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: snapshot.version, command }),
      });
      const body = (await res.json()) as Snapshot & { error?: string };
      if (!res.ok) {
        if (res.status === 409) await reload();
        throw Error(body.error || "Não foi possível salvar o registro.");
      }
      setSnapshot(body);
      toast.success(
        command.type === "settings"
          ? "Parâmetros atualizados."
          : "Registro salvo na operação.",
      );
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  function newOperation(mode = "move", box = "") {
    setDialogMode(mode);
    setDialogBox(box);
    setDialog(true);
  }
  const state = snapshot?.data,
    summary = state ? stats(state) : null,
    activeAlerts = state ? alerts(state) : [],
    boxes = state?.locations.filter((l) => l.stage === 5) || [];
  const location = (id: string) =>
    state?.locations.find((l) => l.id === id)?.name ||
    (id === "external" ? "Chegada" : "—");
  const productFor = (lotId: string) =>
    state?.products.find(
      (p) => p.id === state.lots.find((l) => l.id === lotId)?.productId,
    );
  const filteredMovements =
    state?.movements
      .filter((m) => {
        const lot = state.lots.find((l) => l.id === m.lotId),
          product = productFor(m.lotId);
        return (
          (filter === "all" || product?.id === filter) &&
          [
            lot?.code,
            product?.name,
            location(m.from),
            location(m.to),
            m.reference,
            m.operator,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) || [];
  function exportCSV() {
    if (!state) return;
    const rows = [
      [
        "ID",
        "Data ISO",
        "Lote",
        "Produto",
        "Origem",
        "Destino",
        "Quantidade_kg",
        "Referencia",
        "Operador",
        "Observacao",
      ],
      ...filteredMovements.map((m) => [
        m.id,
        m.createdAt,
        state.lots.find((l) => l.id === m.lotId)?.code || "",
        productFor(m.lotId)?.name || "",
        m.from,
        m.to,
        String(m.quantityKg),
        m.reference,
        m.operator,
        m.note,
      ]),
    ];
    const escape = (s: string) =>
      '"' + (/^[=+@\-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
    const data =
        "\uFEFF" + rows.map((r) => r.map(escape).join(";")).join("\r\n"),
      url = URL.createObjectURL(
        new Blob([data], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "fertilitrace-movimentacoes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: { registerTool: (t: unknown, o: unknown) => void };
      }
    ).modelContext;
    if (!context || !state) return;
    const controller = new AbortController();
    try {
      context.registerTool(
        {
          name: "read_fertilizer_inventory",
          title: "Consultar estoque de fertilizantes",
          description:
            "Retorna saldos contábeis e divergências abertas sem alterar registros.",
          inputSchema: {
            type: "object",
            properties: { box: { type: "string" } },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: (data: unknown) => {
            const b = (data as { box?: unknown })?.box;
            if (
              b !== undefined &&
              (typeof b !== "string" || !boxes.some((x) => x.id === b))
            )
              throw Error("Box inválido");
            return {
              unit: "kg",
              boxes: boxes
                .filter((x) => !b || x.id === b)
                .map((x) => ({
                  box: x.id,
                  stockKg: stockAt(state, x.id),
                  capacityKg: x.capacityKg,
                  product: productAt(state, x.id)?.name || null,
                })),
              alerts: activeAlerts
                .filter((c) => !b || c.locationId === b)
                .map((c) => ({
                  box: c.locationId,
                  differenceKg: c.differenceKg,
                  measuredAt: c.createdAt,
                })),
            };
          },
        },
        { signal: controller.signal },
      );
    } catch {}
    return () => controller.abort();
  }, [state]);
  function MovementTable({ items }: { items: Movement[] }) {
    return (
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto / lote</TableHead>
              <TableHead>Movimentação</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead>Data e hora</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="table-product">
                    <Nutrient product={productFor(m.lotId)} />
                    <div>
                      <strong>{productFor(m.lotId)?.name}</strong>
                      <button
                        onClick={() => {
                          setTraceLot(m.lotId);
                          setView("trace");
                        }}
                      >
                        {state?.lots.find((l) => l.id === m.lotId)?.code}
                      </button>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="movement-path">
                    <span>{location(m.from)}</span>
                    <MoveRight size={14} />
                    <span>{location(m.to)}</span>
                  </div>
                  <small>
                    {m.to === "truck"
                      ? "Expedição"
                      : m.from === "external"
                        ? "Recebimento"
                        : "Movimentação interna"}
                  </small>
                </TableCell>
                <TableCell className="quantity-cell">
                  {tons(m.quantityKg, 3)} <span>t</span>
                </TableCell>
                <TableCell>{m.reference}</TableCell>
                <TableCell>
                  <span>{formatDate(m.createdAt)}</span>
                  <small>Horário de Brasília</small>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!items.length && (
          <div className="empty-state">Nenhuma movimentação encontrada.</div>
        )}
      </div>
    );
  }
  function BoxCard({ id }: { id: string }) {
    if (!state) return null;
    const box = state.locations.find((l) => l.id === id)!,
      stock = stockAt(state, id),
      product = productAt(state, id),
      alert = activeAlerts.find((c) => c.locationId === id),
      occupied = (stock / box.capacityKg) * 100;
    return (
      <button
        className={"box-card " + (alert ? "has-alert" : "")}
        onClick={() => setSelectedBox(id)}
      >
        <div className="box-card-head">
          <span className="box-label">
            <Boxes size={19} />
            {id}
          </span>
          <span
            className={
              "status " + (alert ? "warning" : stock ? "normal" : "vacant")
            }
          >
            {alert ? "Divergência" : stock ? "Em operação" : "Disponível"}
          </span>
        </div>
        <div className="box-product">
          <Nutrient product={product} />
          <span>{product?.name || "Sem produto"}</span>
        </div>
        <div className="box-weight">
          {tons(stock)} <span>t</span>
        </div>
        <div className="occupancy-label">
          <span>Ocupação</span>
          <span>{occupied.toFixed(1).replace(".", ",")}%</span>
        </div>
        <Progress
          value={Math.min(100, occupied)}
          className={"box-progress " + (alert ? "warning" : "")}
        />
        <div className="box-footer">
          <span>Capacidade {tons(box.capacityKg, 0)} t</span>
          {alert ? (
            <span className="difference-badge">
              <TriangleAlert size={13} />
              {tons(Math.abs(alert.differenceKg))} t
            </span>
          ) : (
            <ChevronRight size={16} />
          )}
        </div>
      </button>
    );
  }
  return (
    <SidebarProvider>
      <Toaster richColors position="top-center" />
      <Sidebar className="ft-sidebar">
        <SidebarHeader>
          <a href="/" className="brand">
            <span className="brand-symbol">
              <Leaf size={25} />
            </span>
            <span>
              Fertili<span>Trace</span>
              <small>INTELIGÊNCIA EM MOVIMENTAÇÃO</small>
            </span>
          </a>
          <div className="terminal-label">
            <Anchor size={17} />
            <div>
              Operação portuária<small>Terminal de fertilizantes</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">OPERAÇÃO</div>
          <OperationNavigation
            view={view}
            alertCount={activeAlerts.length}
            onNavigate={(id) => {
              setView(id);
              setSearch("");
              setFilter("all");
            }}
          />
          <div className="npk-note">
            <div>
              <span>N</span>
              <span>P</span>
              <span>K</span>
            </div>
            <strong>Cada tonelada tem um caminho.</strong>
            <p>Do recebimento à expedição, mantenha o histórico do produto.</p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button
            className="settings-link"
            onClick={() => {
              setLimitT(String((state?.settings.absoluteKg || 10000) / 1000));
              setLimitPercent(String(state?.settings.percent || 2));
              setSettingsOpen(true);
            }}
          >
            <Settings2 size={19} /> Parâmetros de alerta
          </button>
          <div className="profile">
            <span>GP</span>
            <div>
              <strong>Geovane Paixão</strong>
              <small>Controle operacional</small>
            </div>
            <span className="profile-chevron">
              <ChevronRight size={16} />
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="ft-main">
        <header className="topbar">
          <div>
            <SidebarTrigger className="menu-trigger" />
            <span>Operação</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="top-context">
              <MapPin size={15} /> Terminal de fertilizantes
            </span>
            <button
              className="notification-button"
              aria-label="Ver alertas"
              onClick={() => setView("alerts")}
            >
              <TriangleAlert size={19} />
              {activeAlerts.length > 0 && <span>{activeAlerts.length}</span>}
            </button>
            <span className="top-avatar">GP</span>
          </div>
        </header>
        <div className="page-area">
          <div className="page-heading">
            <div>
              <div className="eyebrow">FERTILITRACE / OPERAÇÃO</div>
              <h1>
                {view === "overview"
                  ? "Visão geral da operação"
                  : view === "movements"
                    ? "Movimentações"
                    : view === "boxes"
                      ? "Armazéns e boxes"
                      : view === "trace"
                        ? "Rastreabilidade"
                        : "Central de alertas"}
              </h1>
              <p>
                {view === "overview"
                  ? "Acompanhe o caminho dos fertilizantes e o equilíbrio da sua operação."
                  : view === "movements"
                    ? "Cada etapa registrada. Cada tonelada rastreável."
                    : view === "boxes"
                      ? "Saldos, capacidades e conciliações do armazenamento."
                      : view === "trace"
                        ? "Do navio ao caminhão, consulte o histórico completo do lote."
                        : "Concilie diferenças entre o saldo esperado e o estoque medido."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary-button refresh-button"
                onClick={reload}
                aria-label="Atualizar dados"
              >
                <RefreshCw size={17} />
              </button>
              <button
                className="primary-button"
                onClick={() => newOperation()}
                disabled={!state}
              >
                <Plus size={18} /> Nova operação
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading-grid">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="loading-card" />
              ))}
              <p>Carregando registros da operação…</p>
            </div>
          ) : error ? (
            <div className="error-panel">
              <TriangleAlert size={32} />
              <h2>Não foi possível carregar a operação</h2>
              <p>{error}</p>
              <button className="primary-button" onClick={reload}>
                Tentar novamente
              </button>
              {error.includes("Entre") && (
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  Entrar com ChatGPT
                </a>
              )}
            </div>
          ) : state && summary ? (
            <>
              {state.demo && (
                <div className="demo-strip">
                  <Info size={14} />
                  <span>
                    Base inicial de demonstração. Novos registros são salvos na
                    plataforma.
                  </span>
                  <span className="demo-tag">DADOS FICTÍCIOS</span>
                </div>
              )}
              {view === "overview" ? (
                <>
                  <div className="metrics-grid">
                    <div className="metric">
                      <span className="metric-icon green">
                        <Package size={21} />
                      </span>
                      <div className="metric-label">Estoque sob controle</div>
                      <strong>
                        {tons(summary.stock)}
                        <span> t</span>
                      </strong>
                      <p>Saldo contábil em todas as etapas</p>
                    </div>
                    <div className="metric">
                      <span className="metric-icon blue">
                        <ArrowDownLeft size={21} />
                      </span>
                      <div className="metric-label">Total recebido</div>
                      <strong>
                        {tons(summary.incoming)}
                        <span> t</span>
                      </strong>
                      <p>{state.lots.length} lotes registrados</p>
                    </div>
                    <div className="metric">
                      <span className="metric-icon violet">
                        <ArrowUpRight size={21} />
                      </span>
                      <div className="metric-label">Total expedido</div>
                      <strong>
                        {tons(summary.outgoing)}
                        <span> t</span>
                      </strong>
                      <p>Saídas para caminhões</p>
                    </div>
                    <button
                      className="metric alert-metric"
                      onClick={() => setView("alerts")}
                    >
                      <span className="metric-icon amber">
                        <TriangleAlert size={21} />
                      </span>
                      <div className="metric-label">Alertas abertos</div>
                      <strong>
                        {summary.alerts.toString().padStart(2, "0")}
                        <span className="alert-metric-link">
                          Conferir <ChevronRight size={15} />
                        </span>
                      </strong>
                      <p>
                        {summary.alerts
                          ? "Diferenças aguardam conciliação"
                          : "Nenhuma divergência acima do limite"}
                      </p>
                    </button>
                  </div>
                  <div className="overview-middle">
                    <section className="panel flow-panel">
                      <div className="panel-title">
                        <div>
                          <h2>Fluxo operacional</h2>
                          <p>Registros acumulados em cada etapa</p>
                        </div>
                        <span className="subtle-tag">
                          <Route size={14} /> Rastreabilidade ativa
                        </span>
                      </div>
                      <div className="flow-steps">
                        {[1, 2, 3, 4, 5, 6].map((stage, i) => {
                          const Icon = stageIcons[i],
                            nodes = state.locations.filter(
                              (l) => l.stage === stage,
                            ),
                            entries = state.movements.filter((m) =>
                              nodes.some((l) => l.id === m.to),
                            ),
                            q = entries.reduce((n, m) => n + m.quantityKg, 0);
                          return (
                            <div className="flow-step" key={stage}>
                              <span className="flow-icon">
                                <Icon size={25} />
                              </span>
                              <strong>
                                {
                                  [
                                    "Navio",
                                    "Descarga",
                                    "Transportador",
                                    "Armazém",
                                    "Box",
                                    "Caminhão",
                                  ][i]
                                }
                              </strong>
                              <span>{entries.length} registros</span>
                              <small>{tons(q, 0)} t</small>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flow-footer">
                        <CheckCheck size={16} /> Cada transferência mantém a
                        origem, o destino e o lote.
                      </div>
                    </section>
                    <section className="panel inventory-panel">
                      <div className="panel-title">
                        <div>
                          <h2>Estoque por nutriente</h2>
                          <p>Produto principal da classificação</p>
                        </div>
                        <span className="three-dots">NPK</span>
                      </div>
                      <div className="nutrient-bars">
                        {(["N", "P", "K"] as const).map((n) => {
                          const kg = state.lots
                            .filter(
                              (l) =>
                                state.products.find((p) => p.id === l.productId)
                                  ?.nutrient === n,
                            )
                            .reduce(
                              (sum, l) =>
                                sum +
                                state.locations
                                  .filter((x) => x.stage < 6)
                                  .reduce(
                                    (s, x) => s + stockAt(state, x.id, l.id),
                                    0,
                                  ),
                              0,
                            );
                          return (
                            <div className="nutrient-line" key={n}>
                              <div>
                                <span className={"nutrient " + n.toLowerCase()}>
                                  {n}
                                </span>
                                <span>
                                  {n === "N"
                                    ? "Nitrogênio"
                                    : n === "P"
                                      ? "Fósforo"
                                      : "Potássio"}
                                </span>
                                <strong>
                                  {tons(kg, 0)} <small>t de produto</small>
                                </strong>
                              </div>
                              <div className="stock-bar">
                                <span
                                  className={n.toLowerCase()}
                                  style={{
                                    width: summary.stock
                                      ? `${(kg / summary.stock) * 100}%`
                                      : "0%",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="inventory-foot">
                        Peso do fertilizante, sem conversão em massa de
                        nutriente.
                      </p>
                    </section>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>Armazenamento em boxes</h2>
                      <span>Visibilidade para cada ponto da operação</span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setView("boxes")}
                    >
                      Ver todos os boxes <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="box-grid overview-boxes">
                    {boxes.slice(0, 4).map((b) => (
                      <BoxCard key={b.id} id={b.id} />
                    ))}
                  </div>
                  <section className="panel recent-panel">
                    <div className="panel-title">
                      <div>
                        <h2>Últimas movimentações</h2>
                        <p>
                          Recebimentos, transferências e expedições recentes
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setView("movements")}
                      >
                        Ver histórico <ChevronRight size={16} />
                      </button>
                    </div>
                    <MovementTable items={filteredMovements.slice(0, 4)} />
                  </section>
                </>
              ) : view === "movements" ? (
                <section className="panel movement-panel">
                  <div className="filter-bar">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar lote, produto, box ou referência…"
                        aria-label="Buscar movimentações"
                      />
                    </label>
                    <Picker
                      value={filter}
                      onChange={setFilter}
                      items={[
                        { id: "all", label: "Todos os produtos" },
                        ...state.products.map((p) => ({
                          id: p.id,
                          label: p.name,
                        })),
                      ]}
                      label="Filtrar produto"
                    />
                    <button className="secondary-button" onClick={exportCSV}>
                      <Download size={16} /> Exportar CSV
                    </button>
                  </div>
                  <div className="result-count">
                    {filteredMovements.length} registros encontrados ·
                    Quantidades em toneladas
                  </div>
                  <MovementTable items={filteredMovements} />
                </section>
              ) : view === "boxes" ? (
                <>
                  {["Armazém A", "Armazém B"].map((w) => (
                    <section className="warehouse-section" key={w}>
                      <div className="section-heading">
                        <div>
                          <h2>
                            <Warehouse size={21} />
                            {w}
                          </h2>
                          <span>
                            {boxes.filter((b) => b.warehouse === w).length}{" "}
                            boxes · controle por saldo e capacidade
                          </span>
                        </div>
                      </div>
                      <div className="box-grid">
                        {boxes
                          .filter((b) => b.warehouse === w)
                          .map((b) => (
                            <BoxCard key={b.id} id={b.id} />
                          ))}
                      </div>
                    </section>
                  ))}
                  <div className="info-note">
                    <Info size={18} />O saldo é calculado pelos registros. A
                    conciliação compara esse saldo com uma medição física
                    informada.
                  </div>
                </>
              ) : view === "trace" ? (
                <section className="trace-layout">
                  <div className="panel lot-selector">
                    <div className="panel-title">
                      <h2>Lotes da operação</h2>
                    </div>
                    {state.lots.map((l) => (
                      <button
                        className={
                          "lot-button " + (traceLot === l.id ? "selected" : "")
                        }
                        key={l.id}
                        onClick={() => setTraceLot(l.id)}
                      >
                        <Nutrient
                          product={state.products.find(
                            (p) => p.id === l.productId,
                          )}
                        />
                        <div>
                          <strong>{l.code}</strong>
                          <span>
                            {
                              state.products.find((p) => p.id === l.productId)
                                ?.name
                            }
                          </span>
                          <small>{l.vessel}</small>
                        </div>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                  <div className="panel trace-panel">
                    {(() => {
                      const lot =
                        state.lots.find((l) => l.id === traceLot) ||
                        state.lots[0];
                      if (!lot)
                        return (
                          <div className="empty-state">
                            Cadastre uma chegada para iniciar o histórico.
                          </div>
                        );
                      const events = state.movements
                          .filter((m) => m.lotId === lot.id)
                          .sort((a, b) =>
                            a.createdAt.localeCompare(b.createdAt),
                          ),
                        incoming = events
                          .filter((m) => m.from === "external")
                          .reduce((s, m) => s + m.quantityKg, 0),
                        outgoing = events
                          .filter((m) => m.to === "truck")
                          .reduce((s, m) => s + m.quantityKg, 0);
                      return (
                        <>
                          <div className="panel-title">
                            <div>
                              <span className="eyebrow">HISTÓRICO DO LOTE</span>
                              <h2>{lot.code}</h2>
                              <p>
                                {
                                  state.products.find(
                                    (p) => p.id === lot.productId,
                                  )?.name
                                }{" "}
                                · {lot.vessel}
                              </p>
                            </div>
                            <span className="status normal">Rastreado</span>
                          </div>
                          <div className="trace-numbers">
                            <div>
                              <span>Recebido</span>
                              <strong>{tons(incoming)} t</strong>
                            </div>
                            <div>
                              <span>Expedido</span>
                              <strong>{tons(outgoing)} t</strong>
                            </div>
                            <div>
                              <span>Saldo remanescente</span>
                              <strong>{tons(incoming - outgoing)} t</strong>
                            </div>
                          </div>
                          <div className="timeline">
                            {events.map((m, i) => {
                              const node = state.locations.find(
                                  (x) => x.id === m.to,
                                ),
                                Icon = stageIcons[(node?.stage || 1) - 1];
                              return (
                                <div className="timeline-item" key={m.id}>
                                  <span className="timeline-icon">
                                    <Icon size={21} />
                                  </span>
                                  <div>
                                    <div className="timeline-title">
                                      <strong>
                                        {m.from === "external"
                                          ? "Chegada do navio"
                                          : location(m.from) +
                                            " para " +
                                            location(m.to)}
                                      </strong>
                                      <span>{formatDate(m.createdAt)}</span>
                                    </div>
                                    <p>
                                      {tons(m.quantityKg, 3)} t · {m.reference}
                                    </p>
                                    <small>
                                      {m.note || "Sem observação adicional"} ·{" "}
                                      {m.operator}
                                    </small>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </section>
              ) : (
                <>
                  <div className="alerts-summary">
                    <span>
                      <TriangleAlert size={22} />
                    </span>
                    <div>
                      <h2>
                        {activeAlerts.length}{" "}
                        {activeAlerts.length === 1
                          ? "divergência aberta"
                          : "divergências abertas"}
                      </h2>
                      <p>
                        Alerta a partir de {tons(state.settings.absoluteKg)} t
                        ou {state.settings.percent.toLocaleString("pt-BR")}% do
                        saldo esperado na medição.
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => newOperation("count")}
                    >
                      Nova conciliação
                    </button>
                  </div>
                  <div className="alerts-list">
                    {activeAlerts.map((c) => (
                      <div className="panel alert-card" key={c.id}>
                        <span
                          className={
                            "alert-symbol " +
                            (countPercent(c) >= state.settings.percent
                              ? "critical"
                              : "")
                          }
                        >
                          <TriangleAlert size={24} />
                        </span>
                        <div className="alert-content">
                          <div className="alert-title">
                            <h3>Divergência de estoque · {c.locationId}</h3>
                            <span
                              className={
                                "status " +
                                (countPercent(c) >= state.settings.percent
                                  ? "critical"
                                  : "warning")
                              }
                            >
                              {countPercent(c) >= state.settings.percent
                                ? "Prioridade alta"
                                : "Atenção"}
                            </span>
                          </div>
                          <p>{c.note}</p>
                          <div className="alert-values">
                            <span>
                              Esperado<strong>{tons(c.expectedKg)} t</strong>
                            </span>
                            <span>
                              Medido<strong>{tons(c.actualKg)} t</strong>
                            </span>
                            <span>
                              Diferença
                              <strong className="negative">
                                {c.differenceKg < 0 ? "−" : "+"}
                                {tons(Math.abs(c.differenceKg))} t
                              </strong>
                            </span>
                            <span>
                              Variação
                              <strong>
                                {countPercent(c).toFixed(1).replace(".", ",")}%
                              </strong>
                            </span>
                          </div>
                          <small>
                            Medição de {formatDate(c.createdAt)} · {c.operator}
                          </small>
                        </div>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setResolve(c);
                            setResolution("");
                          }}
                        >
                          Registrar tratativa
                        </button>
                      </div>
                    ))}
                    {!activeAlerts.length && (
                      <div className="panel empty-alerts">
                        <CheckCheck size={42} />
                        <h2>Nenhum alerta aberto</h2>
                        <p>
                          As últimas conciliações estão dentro do limite ou já
                          receberam uma tratativa.
                        </p>
                      </div>
                    )}
                  </div>
                  <section className="panel reconciliation-history">
                    <div className="panel-title">
                      <h2>Histórico de conciliações</h2>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Box</TableHead>
                          <TableHead>Esperado</TableHead>
                          <TableHead>Medido</TableHead>
                          <TableHead>Diferença</TableHead>
                          <TableHead>Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...state.counts].reverse().map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              {c.locationId}
                              <small>{formatDate(c.createdAt)}</small>
                            </TableCell>
                            <TableCell>{tons(c.expectedKg)} t</TableCell>
                            <TableCell>{tons(c.actualKg)} t</TableCell>
                            <TableCell>
                              {c.differenceKg < 0 ? "−" : "+"}
                              {tons(Math.abs(c.differenceKg))} t
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  "status " +
                                  (c.acknowledgedAt
                                    ? "normal"
                                    : activeAlerts.some((a) => a.id === c.id)
                                      ? "warning"
                                      : "vacant")
                                }
                              >
                                {c.acknowledgedAt
                                  ? "Tratativa registrada"
                                  : activeAlerts.some((a) => a.id === c.id)
                                    ? "Em análise"
                                    : "Registrado"}
                              </span>
                              {c.resolution && <small>{c.resolution}</small>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                  <div className="info-note">
                    <Info size={18} />
                    Divergência não confirma perda. Verifique medições,
                    documentos e movimentações antes de concluir a causa.
                  </div>
                </>
              )}
              <footer className="page-footer">
                <span>
                  <Leaf size={14} /> FertiliTrace
                </span>
                <span>
                  Registros persistentes · peso em toneladas · horários de
                  Brasília
                </span>
              </footer>
            </>
          ) : null}
        </div>
      </main>
      {state && dialog && (
        <OperationDialog
          key={dialogMode + "-" + dialogBox}
          open={dialog}
          onClose={() => setDialog(false)}
          state={state}
          save={save}
          initialMode={dialogMode}
          initialBox={dialogBox}
        />
      )}
      <Sheet
        open={!!selectedBox}
        onOpenChange={(v) => !v && setSelectedBox("")}
      >
        <SheetContent className="box-sheet">
          <SheetHeader>
            <SheetTitle>Box {selectedBox}</SheetTitle>
            <SheetDescription>
              {state?.locations.find((l) => l.id === selectedBox)?.warehouse} ·
              detalhamento do estoque
            </SheetDescription>
          </SheetHeader>
          {state && selectedBox && (
            <div className="box-detail">
              <div className="detail-weight">
                <span>Saldo contábil atual</span>
                <strong>{tons(stockAt(state, selectedBox), 3)} t</strong>
              </div>
              <h3>Lotes neste box</h3>
              {state.lots
                .filter((l) => stockAt(state, selectedBox, l.id) > 0)
                .map((l) => (
                  <button
                    className="detail-lot"
                    key={l.id}
                    onClick={() => {
                      setTraceLot(l.id);
                      setView("trace");
                      setSelectedBox("");
                    }}
                  >
                    <div>
                      <strong>{l.code}</strong>
                      <small>
                        {state.products.find((p) => p.id === l.productId)?.name}{" "}
                        · {l.vessel}
                      </small>
                    </div>
                    <span>{tons(stockAt(state, selectedBox, l.id))} t</span>
                  </button>
                ))}
              {state.lots.every(
                (l) => stockAt(state, selectedBox, l.id) === 0,
              ) && <p className="muted">Nenhum lote com saldo neste box.</p>}
              <h3>Última medição física</h3>
              {(() => {
                const count = [...state.counts]
                  .reverse()
                  .find((c) => c.locationId === selectedBox);
                return count ? (
                  <div className="count-detail">
                    <strong>{tons(count.actualKg, 3)} t</strong>
                    <span>{formatDate(count.createdAt)}</span>
                    <p>{count.note}</p>
                    <small>
                      Saldo esperado naquela medição:{" "}
                      {tons(count.expectedKg, 3)} t
                    </small>
                  </div>
                ) : (
                  <p className="muted">Nenhuma medição registrada.</p>
                );
              })()}
              <button
                className="primary-button"
                onClick={() => {
                  newOperation("count", selectedBox);
                  setSelectedBox("");
                }}
              >
                <ClipboardCheck size={17} /> Registrar medição
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!resolve}
        onOpenChange={(v) => !v && !saving && setResolve(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tratativa · {resolve?.locationId}</DialogTitle>
            <DialogDescription>
              Registre o que foi verificado. A divergência permanece no
              histórico.
            </DialogDescription>
          </DialogHeader>
          <form
            className="operation-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!resolve || saving) return;
              setSaving(true);
              if (
                await save({
                  type: "acknowledge",
                  requestId: crypto.randomUUID(),
                  countId: resolve.id,
                  note: resolution,
                })
              )
                setResolve(null);
              setSaving(false);
            }}
          >
            <label>
              Tratativa
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                minLength={3}
                maxLength={500}
                required
                placeholder="Ex.: documento conferido; medição refeita; apuração encaminhada…"
              />
            </label>
            <p className="form-info">
              Registrar a tratativa não ajusta automaticamente o estoque.
            </p>
            <button className="primary-button" disabled={saving}>
              {saving && <LoaderCircle size={16} className="spin" />} Registrar
              tratativa
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parâmetros de alerta</DialogTitle>
            <DialogDescription>
              Uma conciliação gera alerta ao atingir qualquer um dos limites.
            </DialogDescription>
          </DialogHeader>
          <form
            className="operation-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              try {
                setSaving(true);
                if (
                  await save({
                    type: "settings",
                    requestId: crypto.randomUUID(),
                    absoluteKg: parseTons(limitT),
                    percent: Number(limitPercent),
                  })
                )
                  setSettingsOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Diferença absoluta (t)
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={limitT}
                onChange={(e) => setLimitT(e.target.value)}
                required
              />
            </label>
            <label>
              Variação sobre o saldo esperado (%)
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={limitPercent}
                onChange={(e) => setLimitPercent(e.target.value)}
                required
              />
            </label>
            <p className="form-info">
              Esses limites servem ao seu controle operacional. Não representam
              um padrão oficial de tolerância.
            </p>
            <button className="primary-button" disabled={!state || saving}>
              {saving && <LoaderCircle size={16} className="spin" />} Salvar
              parâmetros
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
