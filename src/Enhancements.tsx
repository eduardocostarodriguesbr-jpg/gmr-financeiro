import React, { useEffect, useState } from "react";
import { parseCents } from "./money";
import { validatePageResponse } from "./pageContracts";
type Item = Record<string, any>;
async function read(path: string, method = "GET", body?: unknown) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-GMR-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
  return method === "GET" ? (validatePageResponse(path, data) as any) : data;
}
export const categoryMatches = (category: Item, type: string, box: string) =>
  (!category.movement_type ||
    category.movement_type === "both" ||
    category.movement_type === type) &&
  (category.all_boxes !== 0 || category.box_ids?.includes(box));

export function MinistryPicker({
  initial = null,
  label = "Acesso aos ministérios",
  allowEmpty = false,
}: {
  initial?: string[] | null;
  label?: string;
  allowEmpty?: boolean;
}) {
  const [all, setAll] = useState(initial === null),
    [boxes, setBoxes] = useState<Item[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let valid = true;
    read("/boxes")
      .then((rows) => {
        if (valid) setBoxes(rows);
      })
      .catch((e) => {
        if (valid) setError(e.message);
      });
    return () => {
      valid = false;
    };
  }, []);
  return (
    <fieldset className="ministry-picker">
      <legend>{label}</legend>
      <label className="checkbox">
        <input
          type="radio"
          name="ministry_mode"
          value="all"
          checked={all}
          onChange={() => setAll(true)}
        />
        Todos os ministérios
      </label>
      <label className="checkbox">
        <input
          type="radio"
          name="ministry_mode"
          value="selected"
          checked={!all}
          onChange={() => setAll(false)}
        />
        Somente os selecionados
      </label>
      {!all && (
        <>
          <p>
            {allowEmpty
              ? "Sem seleção, o usuário não verá movimentações de nenhum ministério. A administração geral exige acesso a todos."
              : "Selecione um ou mais ministérios para esta categoria."}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {boxes.map((box) => (
            <label className="checkbox" key={box.id}>
              <input
                type="checkbox"
                name="box_ids"
                value={box.id}
                defaultChecked={initial?.includes(box.id)}
              />
              {box.name}
              {!box.active ? " (inativo)" : ""}
            </label>
          ))}
          {!boxes.length && !error && <p>Nenhum ministério disponível.</p>}
        </>
      )}
    </fieldset>
  );
}
export function CategoryFields({ item }: { item?: Item }) {
  return (
    <>
      <label className="field">
        <span>Tipo de movimentação</span>
        <select
          name="movement_type"
          defaultValue={item?.movement_type ?? "both"}
        >
          <option value="both">Entrada e Saída</option>
          <option value="income">Somente Entrada</option>
          <option value="expense">Somente Saída</option>
        </select>
      </label>
      <MinistryPicker
        label="Ministérios desta categoria"
        initial={item?.all_boxes === 0 ? item.box_ids : null}
      />
    </>
  );
}
export function EditOperation({
  item,
  onDone,
  onClose,
}: {
  item: Item;
  onDone: () => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<Item[]>([]),
    [subs, setSubs] = useState<Item[]>([]),
    [category, setCategory] = useState(item.category_id),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [negative, setNegative] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let valid = true;
    Promise.all([read("/categories"), read("/subcategories")])
      .then(([c, s]) => {
        if (valid) {
          setCategories(c);
          setSubs(s);
          setReady(true);
        }
      })
      .catch((e) => {
        if (valid) setError(e.message);
      });
    return () => {
      valid = false;
    };
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const amount = parseCents(String(form.get("amount") ?? ""));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Informe um valor positivo com até duas casas decimais.");
      return;
    }
    setBusy(true);
    try {
      await read("/operations/" + item.id, "PATCH", {
        version: item.version,
        amount_cents: amount,
        category_id: category,
        subcategory_id: form.get("subcategory_id") || null,
        movement_date: form.get("movement_date"),
        description: form.get("description"),
        reason: form.get("reason"),
        payment_method: form.get("payment_method") || item.payment_method,
        confirm_negative: confirmed,
      });
      onDone();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message.includes("saldo ficará negativo")) setNegative(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p>
        Movimentação nº {item.number} ·{" "}
        {item.type === "income" ? "Entrada" : "Saída"} · {item.account_name} ·{" "}
        {item.box_name}
      </p>
      <p>
        As alterações serão registradas no histórico com os valores anteriores e
        o motivo.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <label className="field">
        <span>Data</span>
        <input
          type="date"
          name="movement_date"
          defaultValue={item.movement_date}
          required
        />
      </label>
      <label className="field">
        <span>Descrição</span>
        <input
          name="description"
          defaultValue={item.description}
          required
          maxLength={4000}
        />
      </label>
      <label className="field">
        <span>Valor (R$)</span>
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={(item.amount_cents / 100).toFixed(2).replace(".", ",")}
          onChange={() => setConfirmed(false)}
          required
        />
      </label>
      <label className="field">
        <span>Categoria</span>
        <select
          aria-label="Categoria"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Selecione</option>
          {categories
            .filter(
              (c) => c.active && categoryMatches(c, item.type, item.box_id),
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        <span>Subcategoria (opcional)</span>
        <select
          name="subcategory_id"
          key={category}
          defaultValue={
            category === item.category_id ? (item.subcategory_id ?? "") : ""
          }
        >
          <option value="">Sem subcategoria</option>
          {subs
            .filter((s) => s.active && s.category_id === category)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      {item.type === "expense" && (
        <label className="field">
          <span>Forma de pagamento</span>
          <select
            name="payment_method"
            defaultValue={item.payment_method}
            required
          >
            <option value="cash">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="credit">Crédito</option>
            <option value="debit">Débito</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>Motivo da correção</span>
        <textarea name="reason" required maxLength={4000} />
      </label>
      {negative && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Conferi e confirmo o aviso de saldo negativo.
        </label>
      )}
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Voltar
        </button>
        <button className="button primary" disabled={busy || !ready}>
          {busy ? "Salvando…" : "Salvar correção"}
        </button>
      </div>
    </form>
  );
}
export function AuditPanel({ canExport }: { canExport: boolean }) {
  const [filters, setFilters] = useState({
      from: "",
      to: "",
      user_id: "",
      action: "",
    }),
    [offset, setOffset] = useState(0),
    [options, setOptions] = useState<{ users: Item[]; actions: string[] }>({
      users: [],
      actions: [],
    }),
    [result, setResult] = useState<{
      key: string;
      rows: Item[];
      error: string;
    }>({ key: "", rows: [], error: "" }),
    [exportError, setExportError] = useState(""),
    [exporting, setExporting] = useState(false);
  const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v),
    ).toString(),
    key = qs + "&offset=" + offset;
  useEffect(() => {
    let valid = true;
    read("/audit/options")
      .then((o) => {
        if (valid) setOptions(o);
      })
      .catch(() => {});
    return () => {
      valid = false;
    };
  }, []);
  useEffect(() => {
    let valid = true;
    read("/audit?" + key)
      .then((rows) => {
        if (valid) setResult({ key, rows, error: "" });
      })
      .catch((e) => {
        if (valid) setResult({ key, rows: [], error: e.message });
      });
    return () => {
      valid = false;
    };
  }, [key]);
  const change = (name: string, value: string) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setOffset(0);
    setExportError("");
  };
  async function download() {
    setExporting(true);
    setExportError("");
    try {
      const r = await fetch("/api/audit/export?" + qs, {
        credentials: "same-origin",
      });
      if (!r.ok)
        throw new Error(
          ((await r.json()) as Item).error ?? "Falha na exportação.",
        );
      const url = URL.createObjectURL(await r.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "historico-atividades.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const loading = result.key !== key;
  return (
    <section className="panel">
      <div className="audit-toolbar">
        <h2>Atividades dos usuários</h2>
        <p>
          Horários de Brasília. Exportação inclui todos os resultados filtrados,
          até 10.000 atividades.
        </p>
        <div className="filters">
          <label>
            De
            <input
              aria-label="Histórico: data inicial"
              type="date"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Histórico: data final"
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
          <label>
            Usuário
            <select
              aria-label="Histórico: usuário"
              value={filters.user_id}
              onChange={(e) => change("user_id", e.target.value)}
            >
              <option value="">Todos</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ação
            <select
              aria-label="Histórico: ação"
              value={filters.action}
              onChange={(e) => change("action", e.target.value)}
            >
              <option value="">Todas</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {(
                    {
                      create: "Inclusão",
                      update: "Edição",
                      login: "Entrada",
                      logout: "Saída",
                      approve: "Aprovação",
                      configure: "Configuração",
                      change_password: "Troca de senha",
                      reset_password: "Redefinição de senha",
                    } as Item
                  )[a] ?? a}
                </option>
              ))}
            </select>
          </label>
          {canExport && (
            <button
              className="button secondary"
              disabled={loading || !!result.error || exporting}
              onClick={download}
            >
              {exporting ? "Exportando…" : "Exportar CSV"}
            </button>
          )}
        </div>
      </div>
      {exportError && (
        <p role="alert" className="error">
          {exportError}
        </p>
      )}
      {loading ? (
        <p className="loading">Carregando atividades…</p>
      ) : result.error ? (
        <p role="alert" className="error">
          {result.error}
        </p>
      ) : (
        <>
          <div className="audit-list">
            {result.rows.map((x) => (
              <details key={x.id}>
                <summary>
                  <div>
                    <strong>{x.author}</strong>
                    <span>
                      {x.action} · {x.entity}
                    </span>
                  </div>
                  <time>
                    {new Date(x.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </time>
                </summary>
                <div className="audit-detail">
                  <strong>Antes</strong>
                  <pre>
                    {x.before_json
                      ? JSON.stringify(JSON.parse(x.before_json), null, 2)
                      : "—"}
                  </pre>
                  <strong>Depois</strong>
                  <pre>
                    {x.after_json
                      ? JSON.stringify(JSON.parse(x.after_json), null, 2)
                      : "—"}
                  </pre>
                </div>
              </details>
            ))}
          </div>
          {!result.rows.length && (
            <p className="empty">Nenhuma atividade disponível</p>
          )}
        </>
      )}
      <div className="audit-toolbar">
        <button
          className="button secondary"
          disabled={loading || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          Anterior
        </button>
        <span> Página {Math.floor(offset / 100) + 1} </span>
        <button
          className="button secondary"
          disabled={loading || !!result.error || result.rows.length < 100}
          onClick={() => setOffset((n) => n + 100)}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
