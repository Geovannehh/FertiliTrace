"use client";
import { useState } from "react";
import {
  Ship,
  ArrowRightLeft,
  ClipboardCheck,
  LoaderCircle,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  type Ledger,
  type Command,
  stockAt,
  canTransfer,
  parseTons,
  tons,
} from "@/domain/ledger";
import { toast } from "sonner";
export function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="field-select">
        <SelectValue placeholder="Selecione…" />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function OperationDialog({
  open,
  onClose,
  state,
  save,
  initialMode = "move",
  initialBox = "",
}: {
  open: boolean;
  onClose: () => void;
  state: Ledger;
  save: (c: Command) => Promise<boolean>;
  initialMode?: string;
  initialBox?: string;
}) {
  const [mode, setMode] = useState(initialMode),
    [lot, setLot] = useState(state.lots[0]?.id || ""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [quantity, setQuantity] = useState(""),
    [product, setProduct] = useState(state.products[0]?.id || ""),
    [vessel, setVessel] = useState(""),
    [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [box, setBox] = useState(initialBox || "B04"),
    [saving, setSaving] = useState(false);
  const sources = state.locations.filter(
      (l) => l.stage < 6 && stockAt(state, l.id, lot) > 0,
    ),
    source = state.locations.find((l) => l.id === from),
    destinations = state.locations.filter(
      (l) => source && canTransfer(source, l),
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    try {
      const requestId = crypto.randomUUID();
      let c: Command;
      if (mode === "arrival")
        c = {
          type: "arrival",
          requestId,
          productId: product,
          vessel,
          reference,
          quantityKg: parseTons(quantity),
          note,
        };
      else if (mode === "count")
        c = {
          type: "count",
          requestId,
          locationId: box,
          actualKg: parseTons(quantity),
          note,
        };
      else
        c = {
          type: "move",
          requestId,
          lotId: lot,
          from,
          to,
          quantityKg: parseTons(quantity),
          reference,
          note,
        };
      setSaving(true);
      if (await save(c)) onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="operation-dialog">
        <DialogHeader>
          <DialogTitle>Registrar operação</DialogTitle>
          <DialogDescription>
            Cada etapa fica vinculada ao lote e ao seu histórico.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v);
            setQuantity("");
          }}
        >
          <TabsList className="operation-tabs">
            <TabsTrigger value="arrival">
              <Ship size={15} /> Chegada
            </TabsTrigger>
            <TabsTrigger value="move">
              <ArrowRightLeft size={15} /> Movimentação
            </TabsTrigger>
            <TabsTrigger value="count">
              <ClipboardCheck size={15} /> Conciliação
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <form onSubmit={submit} className="operation-form">
          {mode === "arrival" ? (
            <>
              <label>
                Produto
                <Picker
                  value={product}
                  onChange={setProduct}
                  items={state.products.map((p) => ({
                    id: p.id,
                    label: p.name,
                  }))}
                  label="Produto"
                />
              </label>
              <label>
                Navio
                <input
                  value={vessel}
                  onChange={(e) => setVessel(e.target.value)}
                  placeholder="Nome do navio"
                  maxLength={160}
                  required
                />
              </label>
            </>
          ) : mode === "move" ? (
            <>
              <label>
                Lote
                <Picker
                  value={lot}
                  onChange={(v) => {
                    setLot(v);
                    setFrom("");
                    setTo("");
                  }}
                  items={state.lots.map((l) => ({
                    id: l.id,
                    label:
                      l.code +
                      " · " +
                      state.products.find((p) => p.id === l.productId)?.name,
                  }))}
                  label="Lote"
                />
              </label>
              <div className="form-row">
                <label>
                  Origem
                  <Picker
                    value={from}
                    onChange={(v) => {
                      setFrom(v);
                      setTo("");
                    }}
                    items={sources.map((s) => ({
                      id: s.id,
                      label:
                        s.name + " · " + tons(stockAt(state, s.id, lot)) + " t",
                    }))}
                    label="Origem"
                  />
                </label>
                <label>
                  Destino
                  <Picker
                    value={to}
                    onChange={setTo}
                    items={destinations.map((d) => ({
                      id: d.id,
                      label: d.name,
                    }))}
                    label="Destino"
                  />
                </label>
              </div>
              {!sources.length && (
                <p className="form-info">
                  Este lote foi totalmente expedido. Cadastre uma chegada ou
                  selecione outro lote.
                </p>
              )}
            </>
          ) : (
            <>
              <label>
                Box
                <Picker
                  value={box}
                  onChange={setBox}
                  items={state.locations
                    .filter((l) => l.stage === 5)
                    .map((l) => ({
                      id: l.id,
                      label: l.name + " · " + l.warehouse,
                    }))}
                  label="Box"
                />
              </label>
              <div className="count-summary">
                <span>Saldo esperado no momento</span>
                <strong>{tons(stockAt(state, box), 3)} t</strong>
              </div>
            </>
          )}
          <div className="form-row">
            <label>
              {mode === "count" ? "Estoque físico medido" : "Quantidade"} (t)
              <input
                type="number"
                inputMode="decimal"
                min={mode === "count" ? 0 : 0.001}
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0,000"
                required
              />
            </label>
            {mode !== "count" && (
              <label>
                {mode === "arrival"
                  ? "Referência / BL"
                  : "Documento / NF / veículo"}
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={
                    mode === "arrival"
                      ? "BL-2026-001"
                      : "NF ou placa / referência"
                  }
                  maxLength={160}
                  required
                />
              </label>
            )}
          </div>
          <label>
            {mode === "count" ? "Critério ou método da medição" : "Observação"}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "count"
                  ? "Ex.: pesagem, levantamento ou conferência física"
                  : "Informações úteis para a operação"
              }
              maxLength={500}
              required={mode === "count"}
              minLength={mode === "count" ? 3 : 0}
            />
          </label>
          <p className="form-info">
            <Info size={15} />
            {mode === "count"
              ? "A conciliação compara medições. Ela não altera o saldo contábil nem confirma uma perda."
              : "O saldo e a capacidade do destino são verificados antes de salvar."}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving && <LoaderCircle size={16} className="spin" />} Salvar
              registro
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
