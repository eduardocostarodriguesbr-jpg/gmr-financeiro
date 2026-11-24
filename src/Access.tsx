import { PasswordInput } from "./PasswordInput";
import React, { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Check,
  AlertTriangle,
  Church,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
type Item = Record<string, any>;
async function api(path: string, method = "GET", body?: unknown) {
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
  if (!r.ok) throw Error(data.error ?? "Não foi possível concluir.");
  return data;
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
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      <AlertTriangle size={17} />
      {error}
    </div>
  ) : null;
}
export function AccessScreen({ onLogin }: { onLogin: (u: any) => void }) {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function change(next: string) {
    setMode(next);
    setError("");
    setMessage("");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    setMessage("");
    if (mode === "register" && b.password !== b.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") onLogin(await api("/login", "POST", b));
      else {
        const result = await api("/register", "POST", b);
        setMessage(result.message);
        e.currentTarget?.reset();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story gmr-story">
        <div className="company-signature">
          <img src="/gmr-logo.png" alt="GMR Digital Solutions" />
          <span>
            GMR <small>DIGITAL SOLUTIONS</small>
          </span>
        </div>
        <div className="auth-message">
          <span className="eyebrow">GESTÃO FINANCEIRA PARA IGREJAS</span>
          <h1>
            Organização para cuidar.
            <br />
            <em>Clareza para seguir.</em>
          </h1>
          <p>
            Uma visão simples dos recursos da sua igreja, com responsabilidade
            em cada movimentação.
          </p>
          <div className="brand-accent" />
        </div>
        <span className="auth-footer">
          Tecnologia a serviço da sua comunidade.
        </span>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="auth-tabs" role="tablist" aria-label="Acesso">
            <button
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => change("login")}
            >
              Entrar
            </button>
            <button
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => change("register")}
            >
              Solicitar acesso
            </button>
          </div>
          <span className="eyebrow">
            {mode === "login" ? "BEM-VINDO DE VOLTA" : "FAÇA PARTE DA EQUIPE"}
          </span>
          <h2>
            {mode === "login" ? "Acesse seu financeiro" : "Solicite seu acesso"}
          </h2>
          <p>
            {mode === "login"
              ? "Entre com seu login e senha para continuar."
              : "Cadastre-se e aguarde a autorização. O perfil será definido na aprovação."}
          </p>
          <ErrorBox error={error} />
          {message ? (
            <div className="registration-success" role="status">
              <Check size={24} />
              <h3>Solicitação recebida</h3>
              <p>{message}</p>
              <button
                className="button primary full"
                onClick={() => change("login")}
              >
                Voltar para entrar
                <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} key={mode}>
              {mode === "register" && (
                <Field label="Nome completo">
                  <input name="name" autoComplete="name" required />
                </Field>
              )}
              <Field
                label="Login"
                hint={
                  mode === "register"
                    ? "De 3 a 64 caracteres: letras, números, ponto, hífen ou sublinhado."
                    : undefined
                }
              >
                <input
                  name="login"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  pattern={
                    mode === "register"
                      ? "[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}"
                      : undefined
                  }
                />
              </Field>
              <Field
                label="Senha"
                hint={
                  mode === "register" ? "Use de 8 a 128 caracteres." : undefined
                }
              >
                <PasswordInput
                  name="password"

                  required
                  minLength={mode === "register" ? 8 : undefined}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </Field>
              {mode === "register" && (
                <>
                  <Field label="Confirmar senha">
                    <PasswordInput
                      name="confirm"

                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Tipo de solicitação">
                    <select name="requested_role" defaultValue="member">
                      <option value="member">Integrante da equipe</option>
                      <option value="responsible">
                        Responsável pelo sistema na igreja
                      </option>
                    </select>
                  </Field>
                  <p className="info-note">
                    A escolha acima é uma solicitação, não uma concessão de
                    acesso. O responsável depende de validação da GMR; os demais
                    integrantes dependem de aprovação da equipe autorizada.
                  </p>
                </>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : mode === "login"
                    ? "Entrar"
                    : "Enviar solicitação"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <div className="secure-note">
            <ShieldCheck size={16} />
            Acesso individual, mediante autorização.
          </div>
          <div className="auth-provider">
            <img src="/gmr-logo.png" alt="" />
            Uma solução GMR Digital Solutions
          </div>
        </div>
      </section>
    </main>
  );
}

export function ApprovalPanel({
  rows,
  isMaster,
  canApprove,
  onDone,
}: {
  rows: Item[];
  isMaster: boolean;
  canApprove: boolean;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<Item | null>(null),
    [profiles, setProfiles] = useState<Item[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = rows.filter((r) => r.approval_state === "pending");
  async function choose(row: Item) {
    setTarget(row);
    setError("");
    setSelected("");
    try {
      setProfiles(await api("/approval-profiles"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function decide(reject = false) {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/users/" + target.id + (reject ? "/reject" : "/approve"),
        "POST",
        reject ? {} : { profile_id: selected },
      );
      setTarget(null);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel approval-panel">
      <div className="panel-title">
        <div>
          <h2>
            Solicitações de acesso{" "}
            <span className="request-count">{pending.length}</span>
          </h2>
          <p>Nenhum solicitante acessa o sistema antes da aprovação.</p>
        </div>
        <UserCheck size={22} />
      </div>
      {pending.length ? (
        <div className="request-list">
          {pending.map((row) => (
            <div className="request-row" key={row.id}>
              <span className="avatar">{row.name[0]?.toUpperCase()}</span>
              <div>
                <strong>{row.name}</strong>
                <small>
                  {row.login} ·{" "}
                  {row.requested_role === "responsible"
                    ? "Solicita ser responsável"
                    : "Integrante da equipe"}
                </small>
              </div>
              {row.requested_role === "responsible" && !isMaster ? (
                <span className="badge pending">Validação da GMR</span>
              ) : canApprove ? (
                <button
                  className="button secondary"
                  onClick={() => choose(row)}
                >
                  Analisar solicitação
                </button>
              ) : (
                <span className="badge pending">Aguardando aprovação</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="no-requests">Nenhuma solicitação pendente.</p>
      )}
      {target && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Autorizar acesso"
          >
            <header>
              <div>
                <h2>Autorizar acesso</h2>
                <p>
                  {target.name} · {target.login}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setTarget(null)}
              >
                <X size={20} />
              </button>
            </header>
            <ErrorBox error={error} />
            {target.requested_role === "responsible" && (
              <p className="info-note">
                Ao aprovar, você autoriza esta pessoa como responsável pelo
                sistema na igreja. Escolha um perfil com gestão de usuários e
                perfis e aprovação de acessos.
              </p>
            )}
            <Field label="Perfil a conceder">
              <select
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Selecione o perfil</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="info-note">
              Somente perfis cujas permissões você pode conceder são
              apresentados.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => decide(true)}
              >
                Recusar solicitação
              </button>
              <button
                className="button primary"
                disabled={!selected || busy}
                onClick={() => decide()}
              >
                {busy ? "Salvando…" : "Aprovar acesso"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export function InstitutionForm({
  current,
  onDone,
}: {
  current: Item;
  onDone: (identity: Item) => void;
}) {
  const [name, setName] = useState(current.name ?? "Sua igreja"),
    [logo, setLogo] = useState(current.logo ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Escolha uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 150000) {
      setError("A logo deve ter no máximo 150 KB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          img.width > 0 &&
          img.height > 0 &&
          img.width <= 4096 &&
          img.height <= 4096
            ? resolve()
            : reject(Error("Use uma imagem de até 4096 × 4096 pixels."));
        img.onerror = () => reject(Error("Não foi possível ler a imagem."));
        img.src = data;
      });
      setLogo(data);
    } catch (e) {
      setError((e as Error).message ?? "Imagem inválida.");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/institution", "POST", { name, logo });
      onDone({ name: name.trim(), logo });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel institution-panel">
      <div className="panel-title">
        <div>
          <h2>Identidade da igreja</h2>
          <p>Nome e logo exibidos para a equipe após o login.</p>
        </div>
        <Church size={22} />
      </div>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="identity-preview">
          {logo ? (
            <img src={logo} alt="Prévia da logo da igreja" />
          ) : (
            <span>
              <Church size={36} />
            </span>
          )}
          <div>
            <small>ESPAÇO DA IGREJA</small>
            <h3>{name || "Sua igreja"}</h3>
            <p>Gestão financeira</p>
          </div>
        </div>
        <Field label="Nome da igreja">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </Field>
        <Field
          label="Logo da igreja"
          hint="PNG, JPEG ou WebP. Até 150 KB e 4096 × 4096 pixels."
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </Field>
        {logo && (
          <button
            type="button"
            className="text-button"
            onClick={() => setLogo("")}
          >
            Remover logo
          </button>
        )}
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar identidade"}
          </button>
        </div>
      </form>
    </section>
  );
}
