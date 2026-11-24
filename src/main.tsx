import { ErrorBoundary, PageContent } from "./ErrorBoundary";
import { validatePageResponse } from "./pageContracts";
import { PasswordInput } from "./PasswordInput";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Landmark,
  Layers3,
  Tags,
  Users,
  ShieldCheck,
  History,
  LogOut,
  Plus,
  X,
  ChevronRight,
  ArrowRight,
  Check,
  AlertTriangle,
  Settings,
  Search,
  Menu,
  KeyRound,
} from "lucide-react";
import "./style.css";
import { AccessScreen, ApprovalPanel, InstitutionForm } from "./Access";
import { parseCents as toCents } from "./money";

type Item = Record<string, any>;
type Me = {
  id: string;
  name: string;
  login: string;
  is_master: boolean;
  must_change: boolean;
  permissions: string[];
};
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 100,
  );
const day = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const labels: Record<string, string> = {
  dashboard: "Visão geral",
  operations: "Movimentações",
  accounts: "Contas financeiras",
  boxes: "Caixas",
  categories: "Categorias",
  users: "Usuários",
  profiles: "Perfis de acesso",
  audit: "Histórico de atividades",
  settings: "Configurações",
  opening: "Saldo de abertura",
  institution: "Identidade da igreja",
};
const types: Record<string, string> = {
  income: "Entrada",
  expense: "Saída",
  opening: "Saldo de abertura",
};
const methods: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Crédito",
  debit: "Débito",
};
const permissionLabel = (p: string) => {
  const [a, b] = p.split(".");
  return `${labels[a] ?? ({ movements: "Movimentações", adjustments: "Ajustes" } as Item)[a] ?? a} · ${{ view: "Consultar", create: "Incluir", edit: "Editar", deactivate: "Desativar / reativar", manage: "Gerenciar", approve: "Aprovar", configure: "Configurar" }[b] ?? b}`;
};
async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-GMR-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Não foi possível concluir.");
  return (method === "GET" ? validatePageResponse(path, data) : data) as T;
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      <AlertTriangle size={17} />
      {error}
    </div>
  ) : null;
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const previous = document.activeElement as HTMLElement;
    const el = document.querySelector<HTMLElement>(".modal");
    el?.focus();
    return () => {
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const list = e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,select,textarea,[tabindex="0"]',
            );
            const first = list[0],
              last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

const Auth = AccessScreen;
function Password({
  required,
  onClose,
  onDone,
}: {
  required: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const b = Object.fromEntries(new FormData(e.currentTarget));
    if (b.password !== b.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await api("/password", "POST", b);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={required ? "Defina sua senha" : "Trocar senha"}
      subtitle={
        required
          ? "Troque a senha temporária para acessar o sistema."
          : "Você entrará novamente após a alteração."
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <Field label="Senha atual">
          <PasswordInput
            name="current_password"

            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="Nova senha" hint="Use de 8 a 128 caracteres.">
          <PasswordInput
            name="password"

            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirme a nova senha">
          <PasswordInput
            name="confirm"

            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <button className="button primary full" disabled={busy}>
          {busy ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </Modal>
  );
}

function App() {
  const [me, setMe] = useState<Me | null>(null),
    [identity, setIdentity] = useState<Item>({ name: "Sua igreja", logo: "" }),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState("dashboard"),
    [data, setData] = useState<Item[]>([]),
    [balance, setBalance] = useState<Item>({
      accounts: [],
      boxes: [],
      positions: [],
      totals: { income: 0, expense: 0 },
    }),
    [loading, setLoading] = useState(false),
    [loadedKey, setLoadedKey] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<Item | null>(null),
    [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false),
    [filters, setFilters] = useState({
      from: today().slice(0, 7) + "-01",
      to: today(),
      account_id: "",
      box_id: "",
    });
  const can = (p: string) =>
    !!me && (me.is_master || me.permissions.includes(p));
  useEffect(() => {
    api<Me>("/me")
      .then(setMe)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!me) return;
    const first =
      me.is_master || can("users.approve")
        ? "users"
        : can("dashboard.view")
          ? "dashboard"
          : can("movements.view")
            ? "operations"
            : ([
                "accounts",
                "boxes",
                "categories",
                "users",
                "profiles",
                "audit",
              ].find((x) => can(x + ".view")) ?? "none");
    setPage(first);
  }, [me?.id]);
  useEffect(() => {
    if (me && !me.must_change)
      api("/institution")
        .then(setIdentity)
        .catch(() => {});
  }, [me?.id, me?.must_change]);
  useEffect(() => {
    document.title = me
      ? identity.name + " · Financeiro"
      : "GMR Digital Solutions · Acesso";
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = me && identity.logo ? identity.logo : "/gmr-logo.png";
  }, [me?.id, identity]);
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const requestKey = JSON.stringify([me?.id, page, qs, refresh]);
  useEffect(() => {
    if (!me || me.must_change || page === "none") return;
    let valid = true;
    setError("");
    setLoading(true);
    setSearch("");
    (async () => {
      try {
        if (page === "dashboard") {
          const r = await api("/dashboard?" + qs);
          const rows = can("movements.view")
            ? await api("/operations?" + qs) : [];
          if (valid) {
            setBalance(r);
            setData(rows);
          }
        } else if (page === "operations") {
          const r = await api("/operations?" + qs);
          if (valid) setData(r);
          if (can("movements.create") || can("opening.create")) {
            const b = await api("/balances");
            if (valid) setBalance(b);
          }
        } else if (page === "institution") {
          const result = await api("/institution");
          if (valid) {
            setIdentity(result);
            setData([]);
          }
        } else if (page === "settings") {
          const r = await api("/settings");
          if (valid) setData([r]);
        } else {
          const r = await api("/" + page);
          if (valid) setData(r);
        }
      } catch (e) {
        if (valid) setError((e as Error).message);
      } finally {
        if (valid) {
          setLoadedKey(requestKey);
          setLoading(false);
        }
      }
    })();
    return () => {
      valid = false;
    };
  }, [page, me, refresh, qs]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function done(message = "Salvo com sucesso.") {
    setModal(null);
    setRefresh((n) => n + 1);
    setToast(message);
  }
  async function logout() {
    try {
      await api("/logout", "POST", {});
      setMe(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggle(item: Item) {
    setError("");
    try {
      if (page === "profiles")
        await api("/profiles/" + item.id, "PATCH", {
          ...item,
          active: !item.active,
        });
      else
        await api("/" + page + "/" + item.id, "PATCH", {
          active: !item.active,
        });
      done(item.active ? "Cadastro desativado." : "Cadastro reativado.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const nav = [
    { id: "dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    { id: "operations", icon: ArrowDownLeft, permission: "movements.view" },
    { id: "accounts", icon: Landmark, permission: "accounts.view" },
    { id: "boxes", icon: Layers3, permission: "boxes.view" },
    { id: "categories", icon: Tags, permission: "categories.view" },
    { id: "users", icon: Users, permission: "users.view" },
    { id: "profiles", icon: ShieldCheck, permission: "profiles.view" },
    { id: "audit", icon: History, permission: "audit.view" },
    { id: "settings", icon: Settings, permission: "adjustments.configure" },
    { id: "institution", icon: Landmark, permission: "institution.manage" },
  ];
  if (checking)
    return <div className="initial-loading">Preparando seu financeiro…</div>;
  if (!me) return <Auth onLogin={setMe} />;
  const registryData =
    page === "users"
      ? data.filter((x) => x.approval_state === "approved")
      : data;
  const visible = registryData.filter((x) =>
    Object.values(x).some(
      (v) =>
        typeof v === "string" &&
        v.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ),
  );
  const total = (balance.accounts ?? []).reduce(
      (sum: number, x: Item) => sum + x.balance_cents,
      0,
    ),
    unallocated = (balance.accounts ?? []).reduce(
      (sum: number, x: Item) => sum + x.unallocated_cents,
      0,
    );
  const go = (p: string) => {
    setPage(p);
    setMobile(false);
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go(can("dashboard.view") ? "dashboard" : page);
          }}
        >
          {identity.logo ? (
            <img
              className="church-logo"
              src={identity.logo}
              alt={identity.name}
            />
          ) : (
            <span className="church-placeholder">
              <Landmark size={26} />
            </span>
          )}
          <span className="church-name">
            {identity.name}
            <span className="brand-caption">GESTÃO FINANCEIRA</span>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="workspace-dot" />
          Espaço da igreja
        </div>
        <span className="nav-label">ESPAÇO DE TRABALHO</span>
        <nav>
          {nav.map(
            ({ id, icon: Icon, permission }, i) =>
              (can(permission) || (id === "users" && can("users.approve"))) && (
                <React.Fragment key={id}>
                  {i === 5 && (
                    <span className="nav-label admin-label">ADMINISTRAÇÃO</span>
                  )}
                  <button
                    className={"nav-item " + (page === id ? "selected" : "")}
                    onClick={() => go(id)}
                  >
                    <Icon size={19} />
                    <span>{labels[id]}</span>
                    {page === id && <span className="selected-dot" />}
                  </button>
                </React.Fragment>
              ),
          )}
        </nav>
        <div className="provider-signature">
          <img src="/gmr-logo.png" alt="" />
          <span>
            Tecnologia GMR<small>Digital Solutions</small>
          </span>
        </div>
        <div className="sidebar-foot">
          <ShieldCheck size={18} />
          <div>
            <strong>Controle com responsabilidade</strong>
            <span>Histórico preservado em cada ação.</span>
          </div>
        </div>
        <div className="user-card">
          <span className="avatar">{me.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{me.name}</strong>
            <button onClick={() => setModal({ kind: "password" })}>
              Trocar senha
            </button>
          </div>
          <button className="icon-button" onClick={logout} aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Financeiro</span>
            <ChevronRight size={14} />
            <strong>{labels[page] ?? "Acesso"}</strong>
          </div>
          <span className="today">
            {new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "dashboard"
                  ? "SEU FINANCEIRO, COM CLAREZA"
                  : "GESTÃO FINANCEIRA"}
              </span>
              <h1>{labels[page] ?? "Seu acesso está pronto"}</h1>
              <p>
                {(
                  {
                    dashboard:
                      "Acompanhe os recursos e as movimentações da igreja.",
                    operations:
                      "Entradas, saídas e saldos de abertura em um só lugar.",
                    accounts:
                      "Onde os recursos estão: bancos e dinheiro em espécie.",
                    boxes: "Organize os recursos por sua finalidade.",
                    categories:
                      "Classificações para entender cada entrada e saída.",
                    users: "Acessos individuais para a equipe.",
                    profiles: "Defina o que cada pessoa pode fazer.",
                    audit: "Rastreabilidade das ações dos usuários.",
                    settings: "Regras de aprovação dos saldos de abertura.",
                    institution:
                      "Personalize o nome e a logo apresentados à equipe.",
                  } as Item
                )[page] ??
                  "Seu perfil ainda não possui permissões de consulta."}
              </p>
            </div>
            <div className="heading-actions">
              {["dashboard", "operations"].includes(page) &&
                can("opening.create") && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      setModal({ kind: "operation", type: "opening" })
                    }
                  >
                    <Wallet size={17} />
                    Saldo de abertura
                  </button>
                )}
              {["dashboard", "operations"].includes(page) &&
                can("movements.create") && (
                  <button
                    className="button primary"
                    onClick={() =>
                      setModal({ kind: "operation", type: "income" })
                    }
                  >
                    <Plus size={18} />
                    Nova movimentação
                  </button>
                )}
              {["accounts", "boxes", "categories"].includes(page) &&
                can(page + ".create") && (
                  <button
                    className="button primary"
                    onClick={() =>
                      setModal({ kind: "registry", resource: page })
                    }
                  >
                    <Plus size={18} />
                    Adicionar{" "}
                    {page === "accounts"
                      ? "conta"
                      : page === "boxes"
                        ? "caixa"
                        : "categoria"}
                  </button>
                )}
              {["profiles"].includes(page) && can(page + ".manage") && (
                <button
                  className="button primary"
                  onClick={() =>
                    setModal({ kind: page === "users" ? "user" : "profile" })
                  }
                >
                  <Plus size={18} />
                  {page === "users" ? "Novo usuário" : "Novo perfil"}
                </button>
              )}
            </div>
          </div>
          <ErrorBoundary key={requestKey} onRetry={() => setRefresh(n => n + 1)}>
          <PageContent render={() => (<>
          <ErrorMessage error={error} />
          {loading || loadedKey !== requestKey ? (
            <div className="loading">Carregando informações…</div>
          ) : error ? null : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="metric-grid">
                    <Metric
                      title="Saldo atual"
                      value={total}
                      icon={Wallet}
                      caption="Todas as contas financeiras"
                    />
                    <Metric
                      title="Entradas no período"
                      value={balance.totals?.income ?? 0}
                      icon={ArrowDownLeft}
                      caption="Sem aberturas ou ajustes"
                      tone="green"
                    />
                    <Metric
                      title="Saídas no período"
                      value={balance.totals?.expense ?? 0}
                      icon={ArrowUpRight}
                      caption="Pagamentos efetivados"
                      tone="orange"
                    />
                    <Metric
                      title="Não apropriado"
                      value={unallocated}
                      icon={Layers3}
                      caption="Posição ainda não destinada"
                    />
                  </div>
                  <Filters
                    filters={filters}
                    setFilters={setFilters}
                    accounts={balance.accounts}
                    boxes={balance.boxes}
                  />
                  <div className="period-result">
                    <span>Resultado do período</span>
                    <strong
                      className={
                        (balance.totals?.income ?? 0) -
                          (balance.totals?.expense ?? 0) <
                        0
                          ? "negative"
                          : ""
                      }
                    >
                      {money(
                        (balance.totals?.income ?? 0) -
                          (balance.totals?.expense ?? 0),
                      )}
                    </strong>
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <PanelTitle
                        title="Contas financeiras"
                        note="Saldo atual por localização"
                      />
                      <div className="account-list">
                        {balance.accounts?.length ? (
                          balance.accounts.map((a: Item) => (
                            <div className="account-row" key={a.id}>
                              <span className={"account-icon " + a.type}>
                                {a.type === "cash" ? (
                                  <Wallet size={21} />
                                ) : (
                                  <Landmark size={21} />
                                )}
                              </span>
                              <div>
                                <strong>{a.name}</strong>
                                <small>
                                  {a.type === "cash"
                                    ? "Dinheiro em espécie"
                                    : "Conta bancária"}
                                  {!a.active ? " · Inativa" : ""}
                                </small>
                              </div>
                              <div className="account-value">
                                <strong
                                  className={
                                    a.balance_cents < 0 ? "negative" : ""
                                  }
                                >
                                  {money(a.balance_cents)}
                                </strong>
                                <small
                                  className={
                                    a.unallocated_cents < 0 ? "negative" : ""
                                  }
                                >
                                  {money(a.unallocated_cents)} não apropriado
                                </small>
                              </div>
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="Suas contas começam aqui"
                            description="Cadastre uma conta bancária ou dinheiro em espécie."
                            action={
                              can("accounts.view")
                                ? () => go("accounts")
                                : undefined
                            }
                            actionLabel="Ver contas"
                          />
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <PanelTitle
                        title="Saldo por caixa"
                        note="Destinação dos recursos"
                      />
                      <div className="box-list">
                        {balance.boxes?.length ? (
                          balance.boxes.map((b: Item, i: number) => (
                            <details className="box-item" key={b.id}>
                              <summary>
                                <span className={"box-dot color-" + (i % 4)} />
                                <strong>{b.name}</strong>
                                <span
                                  className={
                                    b.balance_cents < 0 ? "negative" : ""
                                  }
                                >
                                  {money(b.balance_cents)}
                                </span>
                                <ChevronRight size={15} />
                              </summary>
                              <div className="box-detail">
                                {balance.positions
                                  .filter((p: Item) => p.box_id === b.id)
                                  .map((p: Item) => (
                                    <div key={p.account_id}>
                                      <span>
                                        {
                                          balance.accounts.find(
                                            (a: Item) => a.id === p.account_id,
                                          )?.name
                                        }
                                      </span>
                                      <strong>{money(p.balance_cents)}</strong>
                                    </div>
                                  ))}
                                {!balance.positions.some(
                                  (p: Item) => p.box_id === b.id,
                                ) && <small>Sem movimentações.</small>}
                              </div>
                            </details>
                          ))
                        ) : (
                          <Empty
                            title="Cada recurso, uma finalidade"
                            description="Crie caixas para organizar os recursos da igreja."
                            action={
                              can("boxes.view") ? () => go("boxes") : undefined
                            }
                            actionLabel="Ver caixas"
                          />
                        )}
                      </div>
                    </section>
                  </div>
                  {can("movements.view") && (
                    <section className="panel movement-panel">
                      <PanelTitle
                        title="Movimentações do período"
                        note="Até 500 registros; use os filtros para restringir"
                        action={() => go("operations")}
                        actionLabel="Ver movimentações"
                      />
                      <Movements
                        rows={data.slice(0, 6)}
                        canApprove={can("adjustments.approve")}
                        me={me}
                        onApproved={() => done("Saldo de abertura aprovado.")}
                      />
                    </section>
                  )}
                  <p className="footnote">
                    Os filtros alteram os indicadores do período e as
                    movimentações. Os saldos atuais mostram todas as operações
                    efetivadas.
                  </p>
                </>
              )}
              {page === "operations" && (
                <>
                  <Filters
                    filters={filters}
                    setFilters={setFilters}
                    accounts={balance.accounts}
                    boxes={balance.boxes}
                  />
                  <section className="panel">
                    <PanelTitle
                      title="Histórico de movimentações"
                      note="Até 500 registros por consulta"
                    />
                    <Movements
                      rows={data}
                      canApprove={can("adjustments.approve")}
                      me={me}
                      onApproved={() => done("Saldo de abertura aprovado.")}
                    />
                  </section>
                </>
              )}
              {page === "users" && (
                <ApprovalPanel
                  rows={data}
                  isMaster={me.is_master}
                  canApprove={can("users.approve")}
                  onDone={() => done("Solicitação atualizada.")}
                />
              )}
              {[
                "accounts",
                "boxes",
                "categories",
                "users",
                "profiles",
              ].includes(page) && (
                <section className="panel">
                  <div className="list-toolbar">
                    <h2>
                      {registryData.length}{" "}
                      {registryData.length === 1 ? "cadastro" : "cadastros"}
                    </h2>
                    <div className="search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar cadastros"
                        placeholder="Buscar pelo nome…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {visible.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>
                              {page === "accounts"
                                ? "Tipo"
                                : page === "users"
                                  ? "Login e perfil"
                                  : page === "profiles"
                                    ? "Permissões"
                                    : "Descrição"}
                            </th>
                            <th>Situação</th>
                            <th>
                              <span className="sr-only">Ações</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((x) => (
                            <tr key={x.id}>
                              <td>
                                <strong>{x.name}</strong>
                              </td>
                              <td>
                                {page === "accounts" ? (
                                  x.type === "bank" ? (
                                    "Conta bancária"
                                  ) : (
                                    "Dinheiro em espécie"
                                  )
                                ) : page === "users" ? (
                                  <>
                                    {x.login}
                                    <small className="block">
                                      {x.profile_name}
                                      {x.is_responsible
                                        ? " · Responsável pelo sistema"
                                        : ""}
                                      {x.must_change
                                        ? " · Troca de senha pendente"
                                        : ""}
                                    </small>
                                  </>
                                ) : page === "profiles" ? (
                                  `${x.permissions.length} permissões`
                                ) : (
                                  x.description || "—"
                                )}
                              </td>
                              <td>
                                <span
                                  className={
                                    "badge " +
                                    (x.active ? "active" : "inactive")
                                  }
                                >
                                  {x.active ? "Ativo" : "Inativo"}
                                </span>
                              </td>
                              <td>
                                <div className="row-actions">
                                  {(can(page + ".edit") ||
                                    can(page + ".manage")) && (
                                    <button
                                      onClick={() =>
                                        setModal({
                                          kind:
                                            page === "users"
                                              ? "user"
                                              : page === "profiles"
                                                ? "profile"
                                                : "registry",
                                          resource: page,
                                          item: x,
                                        })
                                      }
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {page === "categories" &&
                                    can("categories.view") && (
                                      <button
                                        onClick={() =>
                                          setModal({
                                            kind: "subcategories",
                                            item: x,
                                          })
                                        }
                                      >
                                        Subcategorias
                                      </button>
                                    )}
                                  {(can(page + ".deactivate") ||
                                    can(page + ".manage")) && (
                                    <button
                                      onClick={() =>
                                        setModal({
                                          kind: "confirm",
                                          title: x.active
                                            ? "Desativar cadastro"
                                            : "Reativar cadastro",
                                          description: `${x.active ? "Desativar" : "Reativar"} “${x.name}”? O histórico será preservado.`,
                                          action: () => {
                                            setModal(null);
                                            toggle(x);
                                          },
                                        })
                                      }
                                    >
                                      {x.active ? "Desativar" : "Reativar"}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={
                        search ? "Nenhum resultado" : "Ainda não há cadastros"
                      }
                      description={
                        search
                          ? "Tente outro nome."
                          : page === "users"
                            ? "As pessoas autorizadas aparecerão aqui. Acompanhe as solicitações acima."
                            : "Use o botão acima para criar o primeiro registro."
                      }
                    />
                  )}
                </section>
              )}
              {page === "institution" && (
                <InstitutionForm
                  key={identity.name + identity.logo}
                  current={identity}
                  onDone={(value) => {
                    setIdentity(value);
                    done("Identidade da igreja atualizada.");
                  }}
                />
              )}
              {page === "audit" && (
                <section className="panel">
                  <PanelTitle
                    title="Atividades dos usuários"
                    note="300 registros mais recentes. Senhas nunca são exibidas."
                  />
                  {data.length ? (
                    <div className="audit-list">
                      {data.map((x) => (
                        <details key={x.id}>
                          <summary>
                            <History size={17} />
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
                            <ChevronRight size={16} />
                          </summary>
                          <div className="audit-detail">
                            <strong>Antes</strong>
                            <pre>
                              {x.before_json
                                ? JSON.stringify(
                                    JSON.parse(x.before_json),
                                    null,
                                    2,
                                  )
                                : "—"}
                            </pre>
                            <strong>Depois</strong>
                            <pre>
                              {x.after_json
                                ? JSON.stringify(
                                    JSON.parse(x.after_json),
                                    null,
                                    2,
                                  )
                                : "—"}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Nenhuma atividade disponível"
                      description="As ações dos usuários comuns aparecerão aqui."
                    />
                  )}
                </section>
              )}
              {page === "settings" && (
                <SettingsForm
                  current={data[0]?.adjustment_approval ?? "direct"}
                  onDone={() => done("Política de aprovação atualizada.")}
                />
              )}
            </>
          )}
          </>)} />
          </ErrorBoundary>
        </main>
        <footer className="main-footer">
          <span>{identity.name} · Controle financeiro</span>
          <span>Gestão dos recursos da igreja</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
      {me.must_change || modal?.kind === "password" ? (
        <Password
          required={me.must_change}
          onClose={() => {
            if (me.must_change) void logout();
            else setModal(null);
          }}
          onDone={() => {
            setModal(null);
            setMe(null);
          }}
        />
      ) : null}
      {modal?.kind === "operation" && (
        <OperationForm
          initialType={modal.type}
          can={can}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}{" "}
      {modal?.kind === "registry" && (
        <RegistryForm
          resource={modal.resource}
          item={modal.item}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}{" "}
      {modal?.kind === "profile" && (
        <ProfileForm
          item={modal.item}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}{" "}
      {modal?.kind === "user" && (
        <UserForm
          item={modal.item}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}{" "}
      {modal?.kind === "subcategories" && (
        <Subcategories
          category={modal.item}
          can={can}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.kind === "confirm" && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <p>{modal.description}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Voltar
            </button>
            <button className="button primary" onClick={modal.action}>
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  icon: Icon,
  caption,
  tone = "neutral",
}: {
  title: string;
  value: number;
  icon: typeof Wallet;
  caption: string;
  tone?: string;
}) {
  return (
    <section className={"metric " + tone}>
      <div>
        <span>{title}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>
      <strong className={value < 0 ? "negative" : ""}>{money(value)}</strong>
      <small>{caption}</small>
    </section>
  );
}
function PanelTitle({
  title,
  note,
  action,
  actionLabel,
}: {
  title: string;
  note?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={action}>
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function Empty({
  title,
  description,
  action,
  actionLabel,
}: {
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Layers3 size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="text-button" onClick={action}>
          {actionLabel}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function Filters({
  filters,
  setFilters,
  accounts = [],
  boxes = [],
}: {
  filters: Item;
  setFilters: (x: any) => void;
  accounts?: Item[];
  boxes?: Item[];
}) {
  const change = (k: string, v: string) =>
    setFilters((f: Item) => ({ ...f, [k]: v }));
  return (
    <div className="filters">
      <span className="filter-label">PERÍODO</span>
      <input
        type="date"
        aria-label="Data inicial"
        value={filters.from}
        onChange={(e) => change("from", e.target.value)}
      />
      <span className="date-divider">até</span>
      <input
        type="date"
        aria-label="Data final"
        value={filters.to}
        min={filters.from}
        onChange={(e) => change("to", e.target.value)}
      />
      <div className="filter-spacer" />
      <select
        aria-label="Filtrar conta financeira"
        value={filters.account_id}
        onChange={(e) => change("account_id", e.target.value)}
      >
        <option value="">Todas as contas</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar caixa"
        value={filters.box_id}
        onChange={(e) => change("box_id", e.target.value)}
      >
        <option value="">Todos os caixas</option>
        {boxes.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
function Movements({
  rows,
  canApprove,
  me,
  onApproved,
}: {
  rows: Item[];
  canApprove: boolean;
  me: Me;
  onApproved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function approve(id: string) {
    setBusy(id);
    setError("");
    try {
      await api("/operations/" + id + "/approve", "POST", {});
      onApproved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <ErrorMessage error={error} />
      {!rows.length ? (
        <Empty
          title="Nenhuma movimentação neste período"
          description="Os lançamentos aparecerão aqui depois de registrados."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Movimentação</th>
                <th>Data</th>
                <th>Conta / caixa</th>
                <th>Situação</th>
                <th className="right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="movement-name">
                      <span className={"movement-icon " + r.type}>
                        {r.type === "expense" ? (
                          <ArrowUpRight size={18} />
                        ) : r.type === "opening" ? (
                          <Wallet size={18} />
                        ) : (
                          <ArrowDownLeft size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{r.description}</strong>
                        <small>
                          {types[r.type]} ·{" "}
                          {r.category_name ?? "Não apropriado"}
                          {r.subcategory_name ? " / " + r.subcategory_name : ""}
                          {r.payment_method
                            ? " · " + methods[r.payment_method]
                            : ""}
                          <span className="block">
                            Nº {r.number} · {r.author}
                          </span>
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{day(r.movement_date)}</td>
                  <td>
                    {r.account_name}
                    <small className="block">
                      {r.box_name ?? "Não apropriado"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (r.status === "effective"
                          ? "active"
                          : r.status === "pending"
                            ? "pending"
                            : "inactive")
                      }
                    >
                      {r.status === "effective"
                        ? "Efetivada"
                        : r.status === "pending"
                          ? "Pendente"
                          : "Cancelada"}
                    </span>
                    {r.status === "pending" && canApprove && (
                      <button
                        className="text-button block"
                        disabled={busy === r.id}
                        onClick={() => approve(r.id)}
                      >
                        {busy === r.id ? "Aprovando…" : "Aprovar abertura"}
                      </button>
                    )}
                  </td>
                  <td
                    className={
                      "right amount " +
                      (r.type === "expense"
                        ? "negative"
                        : r.amount_cents < 0
                          ? "negative"
                          : "positive")
                    }
                  >
                    {r.type === "expense"
                      ? "− "
                      : r.amount_cents > 0
                        ? "+ "
                        : ""}
                    {money(Math.abs(r.amount_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RegistryForm({
  resource,
  item,
  onClose,
  onDone,
}: {
  resource: string;
  item?: Item;
  onClose: () => void;
  onDone: (s?: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const b = Object.fromEntries(new FormData(e.currentTarget));
      await api(
        "/" + resource + (item ? "/" + item.id : ""),
        item ? "PATCH" : "POST",
        b,
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        (item ? "Editar " : "Adicionar ") +
        (resource === "accounts"
          ? "conta financeira"
          : resource === "boxes"
            ? "caixa"
            : "categoria")
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <Field label="Nome">
          <input
            name="name"
            required
            defaultValue={item?.name}
            autoFocus
            placeholder={
              resource === "accounts"
                ? "Ex.: Itaú — Conta principal"
                : resource === "boxes"
                  ? "Ex.: Caixa dos Jovens"
                  : "Ex.: Ofertas"
            }
          />
        </Field>
        {resource === "accounts" && !item && (
          <Field label="Tipo">
            <select name="type">
              <option value="bank">Conta bancária</option>
              <option value="cash">Dinheiro em espécie</option>
            </select>
          </Field>
        )}
        {resource === "boxes" && (
          <Field label="Descrição (opcional)">
            <textarea name="description" defaultValue={item?.description} />
          </Field>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Voltar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function OperationForm({
  initialType,
  can,
  onClose,
  onDone,
}: {
  initialType: string;
  can: (p: string) => boolean;
  onClose: () => void;
  onDone: (s?: string) => void;
}) {
  const [type, setType] = useState(initialType),
    [lists, setLists] = useState<Item>({
      accounts: [],
      boxes: [],
      categories: [],
      subcategories: [],
      positions: [],
    }),
    [account, setAccount] = useState(""),
    [box, setBox] = useState(""),
    [category, setCategory] = useState(""),
    [amount, setAmount] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [policy, setPolicy] = useState("direct");
  useEffect(() => {
    Promise.all([
      api("/balances"),
      type === "opening" ? Promise.resolve([]) : api("/categories"),
      type === "opening" ? Promise.resolve([]) : api("/subcategories"),
      type === "opening"
        ? api("/settings")
        : Promise.resolve({ adjustment_approval: "direct" }),
    ])
      .then(([b, c, s, p]) => {
        setLists({
          ...b,
          categories: c.filter((x: Item) => x.active),
          subcategories: s.filter((x: Item) => x.active),
        });
        setPolicy(p.adjustment_approval);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, [type]);
  const a = lists.accounts.find((x: Item) => x.id === account),
    current =
      lists.positions.find(
        (x: Item) =>
          x.account_id === account &&
          (type === "opening" ? x.box_id === null : x.box_id === box),
      )?.balance_cents ?? 0;
  const value = toCents(amount),
    delta = type === "expense" ? -value : value,
    accountAfter =
      (a?.balance_cents ?? 0) + (Number.isFinite(delta) ? delta : 0),
    boxAfter = current + (Number.isFinite(delta) ? delta : 0),
    negative = !!account && (accountAfter < 0 || boxAfter < 0),
    blocked = a?.type === "cash" && accountAfter < 0;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (
      !Number.isSafeInteger(value) ||
      !value ||
      (type !== "opening" && value < 0)
    ) {
      setError("Informe um valor válido, com até duas casas decimais.");
      return;
    }
    if (blocked) {
      setError("Dinheiro em espécie não pode ficar negativo.");
      return;
    }
    if (negative && !confirmed) {
      setError("Confirme o aviso de saldo negativo.");
      return;
    }
    setBusy(true);
    try {
      const b = Object.fromEntries(new FormData(e.currentTarget));
      await api("/operations", "POST", {
        ...b,
        type,
        account_id: account,
        box_id: box || null,
        category_id: category || null,
        subcategory_id: b.subcategory_id || null,
        amount_cents: value,
        confirm_negative: confirmed,
      });
      onDone(
        type === "opening" && policy === "dual"
          ? "Abertura enviada para aprovação."
          : "Movimentação registrada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        type === "opening" ? "Registrar saldo de abertura" : "Nova movimentação"
      }
      subtitle={
        type === "opening"
          ? "O valor ficará inicialmente no saldo não apropriado."
          : "Informe uma entrada ou um pagamento já efetivado."
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        {type !== "opening" && (
          <div className="segmented">
            {["income", "expense"].map((t) => (
              <button
                key={t}
                type="button"
                className={type === t ? "chosen " + t : ""}
                onClick={() => {
                  setType(t);
                  setConfirmed(false);
                }}
              >
                {t === "income" ? (
                  <ArrowDownLeft size={17} />
                ) : (
                  <ArrowUpRight size={17} />
                )}{" "}
                {types[t]}
              </button>
            ))}
          </div>
        )}
        <div className="form-grid">
          <Field label="Data da movimentação">
            <input
              type="date"
              name="movement_date"
              defaultValue={today()}
              required
            />
          </Field>
          <Field
            label="Valor (R$)"
            hint={
              type === "opening"
                ? "Negativo permitido apenas em conta bancária."
                : "Informe um valor positivo."
            }
          >
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setConfirmed(false);
              }}
              placeholder="0,00"
              required
            />
          </Field>
        </div>
        <Field label="Conta financeira">
          <select
            required
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Selecione a conta</option>
            {lists.accounts
              .filter((x: Item) => x.active)
              .map((x: Item) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
        {type !== "opening" && (
          <>
            <Field label="Caixa">
              <select
                required
                value={box}
                onChange={(e) => {
                  setBox(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Selecione o caixa</option>
                {lists.boxes
                  .filter((x: Item) => x.active)
                  .map((x: Item) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Categoria">
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {lists.categories.map((x: Item) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategoria (opcional)">
                <select name="subcategory_id" key={category}>
                  <option value="">Sem subcategoria</option>
                  {lists.subcategories
                    .filter((x: Item) => x.category_id === category)
                    .map((x: Item) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            {type === "expense" && (
              <Field label="Forma de pagamento">
                <select name="payment_method" required>
                  <option value="">Selecione</option>
                  {Object.entries(methods).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        <Field
          label="Descrição"
          hint="Informe a origem ou a finalidade da movimentação."
        >
          <textarea
            name="description"
            required
            placeholder={
              type === "opening"
                ? "Saldo inicial apurado em…"
                : type === "income"
                  ? "Ex.: Oferta do culto de domingo"
                  : "Ex.: Compra de material para o ministério infantil"
            }
          />
        </Field>
        {a && Number.isFinite(value) && (
          <div className="balance-preview">
            <span>
              APÓS A CONFIRMAÇÃO
              {type === "opening" && policy === "dual" ? " E APROVAÇÃO" : ""}
            </span>
            <div>
              <span>{a.name}</span>
              <strong className={accountAfter < 0 ? "negative" : ""}>
                {money(accountAfter)}
              </strong>
            </div>
            <div>
              <span>
                {type === "opening"
                  ? "Não apropriado"
                  : (lists.boxes.find((x: Item) => x.id === box)?.name ??
                    "Caixa")}
              </span>
              <strong className={boxAfter < 0 ? "negative" : ""}>
                {money(boxAfter)}
              </strong>
            </div>
          </div>
        )}
        {blocked ? (
          <ErrorMessage error="Esta operação deixaria dinheiro em espécie negativo." />
        ) : (
          negative && (
            <label className="warning checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Conferi os valores e confirmo que o saldo ficará negativo.
              </span>
            </label>
          )
        )}
        {type === "opening" && policy === "dual" && (
          <p className="info-note">
            Outro usuário autorizado deverá aprovar esta abertura antes de ela
            compor o saldo.
          </p>
        )}
        {type === "opening" && (
          <p className="info-note">
            O saldo de abertura será mantido na posição não apropriada.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Voltar
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              blocked ||
              !ready ||
              !can(type === "opening" ? "opening.create" : "movements.create")
            }
          >
            {busy
              ? "Registrando…"
              : "Confirmar " +
                (type === "opening" ? "abertura" : types[type].toLowerCase())}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProfileForm({
  item,
  onClose,
  onDone,
}: {
  item?: Item;
  onClose: () => void;
  onDone: (s?: string) => void;
}) {
  const [ps, setPs] = useState<string[]>(item?.permissions ?? []),
    [options, setOptions] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/permissions")
      .then(setOptions)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/profiles" + (item ? "/" + item.id : ""),
        item ? "PATCH" : "POST",
        {
          ...Object.fromEntries(new FormData(e.currentTarget)),
          permissions: ps,
        },
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item ? "Editar perfil" : "Novo perfil"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <Field label="Nome">
          <input name="name" defaultValue={item?.name} required />
        </Field>
        <Field label="Descrição (opcional)">
          <textarea name="description" defaultValue={item?.description} />
        </Field>
        <h3>Permissões por ação</h3>
        <p className="info-note">
          Você só pode conceder permissões que possui. Para usar os formulários
          de movimentação, conceda também consulta aos cadastros
          correspondentes.
        </p>
        <div className="permissions">
          {options.map((p) => (
            <label className="checkbox" key={p}>
              <input
                type="checkbox"
                checked={ps.includes(p)}
                onChange={(e) =>
                  setPs(
                    e.target.checked ? [...ps, p] : ps.filter((x) => x !== p),
                  )
                }
              />
              <span>{permissionLabel(p)}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Voltar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar perfil"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function UserForm({
  item,
  onClose,
  onDone,
}: {
  item?: Item;
  onClose: () => void;
  onDone: (s?: string) => void;
}) {
  const [profiles, setProfiles] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false);
  useEffect(() => {
    api("/approval-profiles")
      .then(setProfiles)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(
        "/users" + (item ? "/" + item.id : ""),
        item ? "PATCH" : "POST",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <Field label="Nome">
          <input name="name" defaultValue={item?.name} required />
        </Field>
        {!item && (
          <Field label="Login">
            <input name="login" required autoComplete="off" />
          </Field>
        )}
        <Field label="Perfil">
          <select
            name="profile_id"
            required
            defaultValue={item?.profile_id ?? ""}
          >
            <option value="">Selecione</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {item && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reset}
              onChange={(e) => setReset(e.target.checked)}
            />
            Redefinir senha temporária
          </label>
        )}
        {(!item || reset) && (
          <Field
            label="Senha temporária"
            hint="8 a 128 caracteres. A troca será obrigatória no próximo acesso."
          >
            <PasswordInput
              name="password"

              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Voltar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Subcategories({
  category,
  can,
  onClose,
}: {
  category: Item;
  can: (p: string) => boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(""),
    [newName, setNewName] = useState("");
  const load = () =>
    api("/subcategories")
      .then((r) =>
        setRows(r.filter((x: Item) => x.category_id === category.id)),
      )
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = e.currentTarget;
    try {
      await api("/subcategories", "POST", {
        ...Object.fromEntries(new FormData(f)),
        category_id: category.id,
      });
      f.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(x: Item) {
    try {
      await api("/subcategories/" + x.id, "PATCH", { active: !x.active });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function rename(e: React.FormEvent, id: string) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/subcategories/" + id, "PATCH", { name: newName });
      setEditing("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Subcategorias" subtitle={category.name} onClose={onClose}>
      <ErrorMessage error={error} />
      {can("categories.create") && category.active && (
        <form className="inline-form" onSubmit={submit}>
          <Field label="Nova subcategoria">
            <input name="name" required placeholder="Nome" />
          </Field>
          <button className="button primary" disabled={busy}>
            Adicionar
          </button>
        </form>
      )}
      <div className="sub-list">
        {rows.map((x) => (
          <div key={x.id}>
            {editing === x.id ? (
              <form className="inline-form" onSubmit={(e) => rename(e, x.id)}>
                <Field label="Nome da subcategoria">
                  <input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </Field>
                <button className="button primary" disabled={busy}>
                  Salvar
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditing("")}
                >
                  Voltar
                </button>
              </form>
            ) : (
              <>
                <span>
                  {x.name}
                  <small className="block">
                    {x.active ? "Ativa" : "Inativa"}
                  </small>
                </span>
                <div className="row-actions">
                  {can("categories.edit") && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(x.id);
                        setNewName(x.name);
                      }}
                    >
                      Editar
                    </button>
                  )}
                  {can("categories.deactivate") && (
                    <button className="text-button" onClick={() => toggle(x)}>
                      {x.active ? "Desativar" : "Reativar"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {!rows.length && <p>Nenhuma subcategoria cadastrada.</p>}
      </div>
    </Modal>
  );
}
function SettingsForm({
  current,
  onDone,
}: {
  current: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(current),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel settings-panel">
      <PanelTitle
        title="Aprovação de saldos de abertura"
        note="A mesma política será utilizada pelos ajustes nos próximos incrementos."
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/settings", "POST", { adjustment_approval: value });
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorMessage error={error} />
        <label className="policy">
          <input
            type="radio"
            name="policy"
            checked={value === "direct"}
            onChange={() => setValue("direct")}
          />
          <div>
            <strong>Ajuste direto</strong>
            <p>Usuário com permissão confirma a abertura.</p>
          </div>
        </label>
        <label className="policy">
          <input
            type="radio"
            name="policy"
            checked={value === "dual"}
            onChange={() => setValue("dual")}
          />
          <div>
            <strong>Dupla aprovação</strong>
            <p>
              Outro usuário autorizado deve aprovar. O solicitante não pode
              aprovar a própria operação.
            </p>
          </div>
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar política"}
        </button>
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary onRetry={() => window.location.reload()}><App /></ErrorBoundary>
  </React.StrictMode>,
);
