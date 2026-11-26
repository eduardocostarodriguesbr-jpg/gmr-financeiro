interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}
type User = {
  id: string;
  name: string;
  login: string;
  profile_id: string | null;
  is_master: number;
  active: number;
  must_change: number;
  session_version: number;
  permissions: string[];
  box_scope: string | null;
};
type Row = Record<string, any>;
const AREAS: Record<string, string[]> = {
  accounts: ["view", "create", "edit", "deactivate"],
  boxes: ["view", "create", "edit", "deactivate"],
  categories: ["view", "create", "edit", "deactivate"],
  users: ["view", "manage", "approve"],
  institution: ["manage"],
  profiles: ["view", "manage"],
  movements: ["view", "create", "edit"],
  dashboard: ["view"],
  audit: ["view", "export"],
  opening: ["create"],
  adjustments: ["approve", "configure"],
};
export const PERMISSIONS = Object.entries(AREAS).flatMap(([area, actions]) =>
  actions.map((a) => `${area}.${a}`),
);
const MAX_CENTS = 100_000_000_000;
const encoder = new TextEncoder();
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, status = 400): never {
  throw new Failure(status, message);
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function text(v: unknown, label: string, optional = false): string {
  if (v == null && optional) return "";
  if (typeof v !== "string" || (!optional && !v.trim()))
    fail(`${label} é obrigatório.`);
  if (v.length > 4000) fail(`${label} excede o limite de armazenamento.`);
  return v.trim();
}
function allowed(u: User, p: string) {
  if (u.is_master) return true;
  if (
    u.box_scope != null &&
    /^(users|profiles|institution|accounts|boxes|categories|opening|adjustments)\.(?!view$)/.test(
      p,
    )
  )
    return false;
  if (u.box_scope != null && /^(users|profiles)\./.test(p)) return false;
  return u.permissions.includes(p);
}
function need(u: User, p: string) {
  if (!allowed(u, p)) fail("Seu perfil não permite esta ação.", 403);
}
function permissions(v: unknown, u: User) {
  if (
    !Array.isArray(v) ||
    v.some((p) => typeof p !== "string" || !PERMISSIONS.includes(p))
  )
    fail("Permissões inválidas.");
  const ps = [...new Set(v)] as string[];
  if (ps.some((p) => !allowed(u, p)))
    fail("Você não pode conceder permissões que não possui.", 403);
  return ps;
}
function b64(a: Uint8Array) {
  return btoa(String.fromCharCode(...a));
}
function unb64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function digest(s: string) {
  return b64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s))),
  );
}
async function passwordHash(
  p: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function passwordMatches(p: string, hash: string) {
  const pieces = hash.split("$");
  if (pieces.length !== 4) return false;
  const result = await passwordHash(p, unb64(pieces[2]));
  const a = encoder.encode(result),
    b = encoder.encode(hash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] ?? 0);
  return diff === 0;
}
function validatePassword(v: unknown) {
  if (typeof v !== "string" || v.length < 8 || v.length > 128)
    fail("Use uma senha com 8 a 128 caracteres.");
  return v;
}
function local(req: Request) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(req.url).hostname,
  );
}
function cookie(token: string, req: Request, maxAge = 28800) {
  return `gmr_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${local(req) ? "" : "; Secure"}`;
}
async function actor(req: Request, db: D1Database) {
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)gmr_session=([^;]+)/)?.[1];
  if (!token) fail("Faça login para continuar.", 401);
  const u = await db
    .prepare(
      `SELECT u.*, p.permissions,p.active AS profile_active FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.id=u.profile_id WHERE s.token_hash=? AND s.expires_at>? AND s.version=u.session_version AND u.active=1 AND u.approval_state='approved'`,
    )
    .bind(await digest(token), now())
    .first<Row>();
  if (!u || (!u.is_master && !u.profile_active))
    fail("Sua sessão expirou. Entre novamente.", 401);
  return { ...u, permissions: JSON.parse(u.permissions ?? "[]") } as User;
}
function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    login: u.login,
    profile_id: u.profile_id,
    is_master: !!u.is_master,
    must_change: !!u.must_change,
    permissions: PERMISSIONS.filter((p) => allowed(u, p)),
    box_ids:
      u.is_master || u.box_scope == null ? null : JSON.parse(u.box_scope),
  };
}
function audit(
  db: D1Database,
  u: Pick<User, "id" | "is_master">,
  action: string,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  return db
    .prepare(
      "INSERT INTO audit (id,user_id,actor_master,action,entity,record_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      uid(),
      u.id,
      u.is_master,
      action,
      entity,
      id,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      now(),
    );
}
async function active(
  db: D1Database,
  table: string,
  id: unknown,
  label: string,
) {
  if (typeof id !== "string") fail(`${label} é obrigatório.`);
  const r = await db
    .prepare(`SELECT * FROM ${table} WHERE id=? AND active=1`)
    .bind(id)
    .first<Row>();
  if (!r) fail(`${label} não encontrado ou inativo.`);
  return r;
}
function date(v: unknown) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail("Data inválida.");
  return v;
}
function cents(v: unknown, signed = false) {
  if (
    typeof v !== "number" ||
    !Number.isSafeInteger(v) ||
    Math.abs(v) > MAX_CENTS ||
    v === 0 ||
    (!signed && v < 0)
  )
    fail("Informe um valor válido e diferente de zero, em centavos.");
  return v;
}

function scope(u: User): string[] | null {
  return u.is_master || u.box_scope == null ? null : JSON.parse(u.box_scope);
}
function scopeClause(u: User, column: string, params: any[]) {
  const ids = scope(u);
  if (ids === null) return "1=1";
  if (!ids.length) return "0=1";
  params.push(JSON.stringify(ids));
  return column + " IN (SELECT value FROM json_each(?))";
}
function needBox(u: User, id: string | null) {
  const ids = scope(u);
  if (ids !== null && (id === null || !ids.includes(id)))
    fail("Ministério fora do seu acesso.", 403);
}
async function boxSelection(
  db: D1Database,
  value: unknown,
): Promise<string[] | null> {
  if (value === null) return null;
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== "string") ||
    value.length > 200
  )
    fail("Seleção de ministérios inválida.");
  const ids = [...new Set(value)] as string[];
  for (const id of ids) await active(db, "boxes", id, "Ministério");
  return ids;
}
async function categoryRule(
  db: D1Database,
  category: Row,
  type: string,
  box: string,
) {
  if (category.movement_type !== "both" && category.movement_type !== type)
    fail("A categoria não aceita este tipo de movimentação.");
  if (
    !category.all_boxes &&
    !(await db
      .prepare("SELECT 1 FROM category_boxes WHERE category_id=? AND box_id=?")
      .bind(category.id, box)
      .first())
  )
    fail("A categoria não pertence ao ministério selecionado.");
}

async function balances(db: D1Database, u: User) {
  const params: any[] = [];
  const condition = scopeClause(u, "box_id", params);
  const p = await db
    .prepare(
      "SELECT account_id,box_id,SUM(amount_cents) AS balance_cents FROM postings WHERE " +
        condition +
        " GROUP BY account_id,box_id",
    )
    .bind(...params)
    .all<Row>();
  const accounts = (
    await db
      .prepare("SELECT * FROM financial_accounts ORDER BY name")
      .all<Row>()
  ).results.map((a) => ({
    ...a,
    balance_cents: p.results
      .filter((p) => p.account_id === a.id)
      .reduce((n, p) => n + Number(p.balance_cents), 0),
    unallocated_cents: p.results
      .filter((p) => p.account_id === a.id && p.box_id === null)
      .reduce((n, p) => n + Number(p.balance_cents), 0),
  }));
  const bp: any[] = [];
  const bc = scopeClause(u, "id", bp);
  const boxes = (
    await db
      .prepare("SELECT * FROM boxes WHERE " + bc + " ORDER BY name")
      .bind(...bp)
      .all<Row>()
  ).results.map((b) => ({
    ...b,
    balance_cents: p.results
      .filter((p) => p.box_id === b.id)
      .reduce((n, p) => n + Number(p.balance_cents), 0),
  }));
  return { accounts, boxes, positions: p.results };
}

function bodySize(req: Request, limit = 32768) {
  if (Number(req.headers.get("Content-Length") ?? 0) > limit)
    fail("Solicitação muito grande.", 413);
}
async function readBody(req: Request, limit = 32768): Promise<Row> {
  bodySize(req, limit);
  const raw = await req.text();
  if (raw.length > limit) fail("Solicitação muito grande.", 413);
  try {
    const b = JSON.parse(raw);
    if (!b || Array.isArray(b) || typeof b !== "object")
      fail("Dados inválidos.");
    return b;
  } catch {
    fail("Dados inválidos.");
  }
}
function isAdmin(ps: string[]) {
  return ps.includes("users.manage") && ps.includes("profiles.manage");
}
async function lastAdmin(
  db: D1Database,
  userId: string | null,
  profileId: string | null,
) {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u JOIN profiles p ON p.id=u.profile_id WHERE u.active=1 AND u.is_master=0 AND p.active=1 AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='users.manage') AND EXISTS(SELECT 1 FROM json_each(p.permissions) WHERE value='profiles.manage') AND (? IS NULL OR u.id<>?) AND (? IS NULL OR p.id<>?)`,
    )
    .bind(userId, userId, profileId, profileId)
    .first<Row>();
  return Number(r?.n ?? 0);
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname,
    method = req.method,
    db = env.DB;
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
  if (!["GET", "POST", "PATCH"].includes(method))
    fail("Método não permitido.", 405);
  if (method !== "GET") {
    if (req.headers.get("X-GMR-Request") !== "1")
      fail("Solicitação não autorizada.", 403);
    const origin = req.headers.get("Origin");
    if (origin) {
      let originUrl: URL;
      try {
        originUrl = new URL(origin);
      } catch {
        fail("Origem inválida.", 403);
      }
      if (
        originUrl.origin !== url.origin &&
        !(
          local(req) &&
          ["127.0.0.1", "localhost"].includes(originUrl.hostname) &&
          ["5173", "8787", "8790"].includes(originUrl.port)
        )
      )
        fail("Origem não autorizada.", 403);
    }
    if (!req.headers.get("Content-Type")?.startsWith("application/json"))
      fail("Envie os dados em JSON.", 415);
  }
  if (path === "/api/setup" && method === "GET")
    return json({ registration_enabled: true });
  if (path === "/api/setup" && method !== "GET")
    fail("Recurso não encontrado.", 404);
  if (path === "/api/register" && method === "POST") {
    const b = await readBody(req),
      name = text(b.name, "Nome"),
      login = text(b.login, "Login").toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login))
      fail(
        "Use um login de 3 a 64 caracteres, com letras, números, ponto, hífen ou sublinhado.",
      );
    if (!["member", "responsible"].includes(b.requested_role))
      fail("Selecione o tipo de solicitação.");
    const stamp = Date.now(),
      key = await digest(
        "register|" + (req.headers.get("CF-Connecting-IP") ?? "local"),
      );
    await db
      .prepare(
        "INSERT INTO login_attempts(key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END",
      )
      .bind(key, stamp, stamp - 3600000, stamp - 3600000)
      .run();
    const attempt = await db
      .prepare("SELECT count FROM login_attempts WHERE key=?")
      .bind(key)
      .first<Row>();
    if (Number(attempt?.count) > 10)
      fail("Limite de solicitações atingido. Tente novamente mais tarde.", 429);
    const hash = await passwordHash(validatePassword(b.password)),
      recordId = uid(),
      at = now();
    const existing = await db
      .prepare("SELECT id FROM users WHERE login=? COLLATE NOCASE")
      .bind(login)
      .first();
    if (!existing)
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,login,password_hash,profile_id,active,must_change,approval_state,requested_role,created_at) VALUES (?,?,?,?,'system-pending',0,0,'pending',?,?)",
          )
          .bind(recordId, name, login, hash, b.requested_role, at),
        audit(
          db,
          { id: recordId, is_master: 0 },
          "request_access",
          "user",
          recordId,
          null,
          { name, requested_role: b.requested_role, status: "pending" },
        ),
      ]);
    return json(
      {
        message:
          "Se o login estiver disponível, sua solicitação foi registrada. Aguarde a autorização para acessar.",
      },
      202,
    );
  }

  if (path === "/api/login" && method === "POST") {
    const b = await readBody(req),
      login = text(b.login, "Login").toLowerCase();
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    const key = await digest(ip + "|" + login),
      stamp = Date.now();
    await db
      .prepare(
        "INSERT INTO login_attempts(key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END",
      )
      .bind(key, stamp, stamp - 900000, stamp - 900000)
      .run();
    const attempt = await db
      .prepare("SELECT count FROM login_attempts WHERE key=?")
      .bind(key)
      .first<Row>();
    if (Number(attempt?.count) > 10)
      fail("Muitas tentativas. Tente novamente em 15 minutos.", 429);
    const r = await db
      .prepare(
        "SELECT u.*,p.permissions,p.active AS profile_active FROM users u LEFT JOIN profiles p ON p.id=u.profile_id WHERE u.login=? COLLATE NOCASE",
      )
      .bind(login)
      .first<Row>();
    const dummy =
      "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const valid = await passwordMatches(
      typeof b.password === "string" ? b.password : "",
      r?.password_hash ?? dummy,
    );
    if (
      !r ||
      !valid ||
      !r.active ||
      r.approval_state !== "approved" ||
      (!r.is_master && !r.profile_active)
    )
      fail("Login ou senha inválidos, ou acesso ainda não autorizado.", 401);
    const token = b64(crypto.getRandomValues(new Uint8Array(32)));
    const u = { ...r, permissions: JSON.parse(r.permissions ?? "[]") } as User;
    await db.batch([
      db
        .prepare(
          "INSERT INTO sessions(token_hash,user_id,version,expires_at) VALUES (?,?,?,?)",
        )
        .bind(
          await digest(token),
          r.id,
          r.session_version,
          new Date(stamp + 28800000).toISOString(),
        ),
      db.prepare("UPDATE login_attempts SET count=0 WHERE key=?").bind(key),
      audit(db, u, "login", "session", u.id, null, { authenticated: true }),
    ]);
    const response = json(publicUser(u));
    response.headers.set("Set-Cookie", cookie(token, req));
    return response;
  }
  const u = await actor(req, db);
  if (path === "/api/me" && method === "GET") return json(publicUser(u));
  if (path === "/api/logout" && method === "POST") {
    const token =
      req.headers.get("Cookie")?.match(/(?:^|;\s*)gmr_session=([^;]+)/)?.[1] ??
      "";
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await digest(token))
      .run();
    const r = json({ ok: true });
    r.headers.set("Set-Cookie", cookie("", req, 0));
    return r;
  }
  if (path === "/api/password" && method === "POST") {
    const b = await readBody(req),
      r = await db
        .prepare("SELECT password_hash FROM users WHERE id=?")
        .bind(u.id)
        .first<Row>();
    if (
      !(await passwordMatches(
        String(b.current_password ?? ""),
        r!.password_hash,
      ))
    )
      fail("A senha atual está incorreta.");
    const next = validatePassword(b.password);
    if (await passwordMatches(next, r!.password_hash))
      fail("A nova senha deve ser diferente da atual.");
    await db.batch([
      db
        .prepare(
          "UPDATE users SET password_hash=?,must_change=0,session_version=session_version+1 WHERE id=?",
        )
        .bind(await passwordHash(next), u.id),
      audit(db, u, "change_password", "user", u.id, null, {
        password_changed: true,
      }),
    ]);
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", cookie("", req, 0));
    return response;
  }
  if (u.must_change)
    fail("Troque sua senha temporária antes de continuar.", 403);
  if (path === "/api/institution") {
    const previous = JSON.parse(
      (await db
        .prepare("SELECT value FROM settings WHERE key='church_identity'")
        .first<Row>())!.value,
    );
    if (method === "GET") return json(previous);
    need(u, "institution.manage");
    const b = await readBody(req, 220000),
      name = text(b.name, "Nome da igreja"),
      logo = b.logo ?? "";
    if (name.length > 120)
      fail("O nome da igreja deve ter até 120 caracteres.");
    if (typeof logo !== "string") fail("Logo inválida.");
    if (logo) {
      const match = logo.match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
      );
      if (!match) fail("Envie uma imagem PNG, JPEG ou WebP.");
      let bytes: Uint8Array;
      try {
        bytes = unb64(match[2]);
      } catch {
        fail("Imagem inválida.");
      }
      if (bytes.length > 150000) fail("A logo deve ter no máximo 150 KB.");
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!(
        (match[1] === "png" && png) ||
        (match[1] === "jpeg" && jpeg) ||
        (match[1] === "webp" && webp)
      ))
        fail("O conteúdo não corresponde ao formato da imagem.");
    }
    await db.batch([
      db
        .prepare("UPDATE settings SET value=? WHERE key='church_identity'")
        .bind(JSON.stringify({ name, logo })),
      audit(
        db,
        u,
        "update",
        "institution",
        "church_identity",
        { name: previous.name, has_logo: !!previous.logo },
        { name, has_logo: !!logo, logo_changed: logo !== previous.logo },
      ),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/approval-profiles" && method === "GET") {
    if (!allowed(u, "users.approve") && !allowed(u, "users.manage"))
      fail("Seu perfil não permite esta consulta.", 403);
    const rows = (
      await db
        .prepare(
          "SELECT id,name,permissions FROM profiles WHERE active=1 AND id<>'system-pending' ORDER BY name",
        )
        .all<Row>()
    ).results;
    return json(
      rows
        .filter((p) =>
          JSON.parse(p.permissions).every((permission: string) =>
            allowed(u, permission),
          ),
        )
        .map((p) => ({ id: p.id, name: p.name })),
    );
  }
  if (
    /^\/api\/users\/[^/]+\/(approve|reject)$/.test(path) &&
    method === "POST"
  ) {
    need(u, "users.approve");
    const targetId = path.split("/")[3],
      reject = path.endsWith("/reject");
    const target = await db
      .prepare(
        "SELECT id,name,login,requested_role,approval_state FROM users WHERE id=? AND is_master=0 AND approval_state='pending'",
      )
      .bind(targetId)
      .first<Row>();
    if (!target) fail("Solicitação pendente não encontrada.", 404);
    if (target.requested_role === "responsible" && !u.is_master)
      fail(
        "A autorização do responsável pelo sistema é reservada ao proprietário.",
        403,
      );
    const b = await readBody(req),
      at = now();
    if (reject) {
      await db.batch([
        db
          .prepare(
            "INSERT INTO access_decisions(user_id,decided_by,decision,created_at) VALUES (?,?,'rejected',?)",
          )
          .bind(targetId, u.id, at),
        db
          .prepare(
            "UPDATE users SET approval_state='rejected',active=0,approved_by=?,approved_at=? WHERE id=? AND approval_state='pending'",
          )
          .bind(u.id, at, targetId),
        audit(
          db,
          u,
          "reject_access",
          "user",
          targetId,
          { status: "pending" },
          { status: "rejected" },
        ),
      ]);
      return json({ ok: true });
    }
    const profile = await active(db, "profiles", b.profile_id, "Perfil");
    permissions(JSON.parse(profile.permissions), u);
    if (
      target.requested_role === "responsible" &&
      !isAdmin(JSON.parse(profile.permissions))
    )
      fail(
        "O responsável precisa de um perfil com gestão de usuários e perfis.",
      );
    if (
      target.requested_role === "responsible" &&
      !JSON.parse(profile.permissions).includes("users.approve")
    )
      fail("O responsável precisa de permissão para aprovar usuários.");
    await db.batch([
      db
        .prepare(
          "INSERT INTO access_decisions(user_id,decided_by,decision,created_at) VALUES (?,?,'approved',?)",
        )
        .bind(targetId, u.id, at),
      db
        .prepare(
          "UPDATE users SET profile_id=?,approval_state='approved',active=1,is_responsible=?,approved_by=?,approved_at=?,session_version=session_version+1 WHERE id=? AND approval_state='pending'",
        )
        .bind(
          profile.id,
          target.requested_role === "responsible" ? 1 : 0,
          u.id,
          at,
          targetId,
        ),
      audit(
        db,
        u,
        "approve_access",
        "user",
        targetId,
        { status: "pending" },
        {
          status: "approved",
          profile_id: profile.id,
          responsible: target.requested_role === "responsible",
        },
      ),
    ]);
    return json({ ok: true });
  }

  if (path === "/api/permissions" && method === "GET")
    return json(PERMISSIONS.filter((p) => allowed(u, p)));
  if (path === "/api/dashboard" && method === "GET") {
    need(u, "dashboard.view");
    const clauses = ["status='effective'", "type IN ('income','expense')"],
      params: string[] = [];
    for (const [key, column] of [
      ["from", "movement_date>="],
      ["to", "movement_date<="],
      ["account_id", "account_id="],
      ["box_id", "box_id="],
    ] as const) {
      const v = url.searchParams.get(key);
      if (v) {
        if (key === "from" || key === "to") date(v);
        clauses.push(`${column}?`);
        params.push(v);
      }
    }
    clauses.push(scopeClause(u, "box_id", params));
    const totals = await db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END),0) AS income,COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END),0) AS expense FROM operations WHERE ${clauses.join(" AND ")}`,
      )
      .bind(...params)
      .first();
    return json({ ...(await balances(db, u)), totals });
  }
  const tables: Record<string, string> = {
    accounts: "financial_accounts",
    boxes: "boxes",
    categories: "categories",
    subcategories: "subcategories",
  };
  const resource = path.split("/")[2],
    id = path.split("/")[3],
    table = tables[resource];
  if (table) {
    const area = resource === "subcategories" ? "categories" : resource;
    if (method === "GET") {
      need(u, `${area}.view`);
      const scopeParams: any[] = [];
      let where = "1=1";
      if (resource === "boxes") where = scopeClause(u, "id", scopeParams);
      if (resource === "categories" && scope(u) !== null)
        where =
          "(all_boxes=1 OR id IN (SELECT category_id FROM category_boxes WHERE " +
          scopeClause(u, "box_id", scopeParams) +
          "))";
      if (resource === "subcategories" && scope(u) !== null)
        where =
          "category_id IN (SELECT id FROM categories WHERE all_boxes=1 OR id IN (SELECT category_id FROM category_boxes WHERE " +
          scopeClause(u, "box_id", scopeParams) +
          "))";
      const result = await db
        .prepare(
          `SELECT id,name,active${resource === "accounts" ? ",type" : resource === "boxes" ? ",description" : resource === "subcategories" ? ",category_id" : resource === "categories" ? ",movement_type,all_boxes" : ""} FROM ${table} WHERE ${where} ORDER BY name`,
        )
        .bind(...scopeParams)
        .all<Row>();
      if (resource === "categories") {
        const links = (
          await db
            .prepare("SELECT category_id,box_id FROM category_boxes")
            .all<Row>()
        ).results;
        const ids = scope(u);
        return json(
          result.results.map((c) => ({
            ...c,
            box_ids: links
              .filter(
                (l) =>
                  l.category_id === c.id &&
                  (ids === null || ids.includes(l.box_id)),
              )
              .map((l) => l.box_id),
          })),
        );
      }
      return json(result.results);
    }
    const b = await readBody(req);
    if (method === "POST" && !id) {
      need(u, `${area}.create`);
      const recordId = uid(),
        name = text(b.name, "Nome"),
        data: Row = { id: recordId, name };
      const fields = ["id", "name", "created_by", "created_at"],
        values: any[] = [recordId, name, u.id, now()];
      if (resource === "accounts") {
        if (!["bank", "cash"].includes(b.type)) fail("Tipo de conta inválido.");
        fields.push("type");
        values.push(b.type);
        data.type = b.type;
      }
      if (resource === "boxes") {
        data.description = text(b.description, "Descrição", true);
        fields.push("description");
        values.push(data.description);
      }
      let categoryBoxes: string[] | null = null;
      if (resource === "categories") {
        const type = b.movement_type ?? "both";
        if (!["both", "income", "expense"].includes(type))
          fail("Tipo de categoria inválido.");
        categoryBoxes = await boxSelection(db, b.box_ids ?? null);
        if (categoryBoxes?.length === 0)
          fail("Selecione ao menos um ministério ou todos.");
        fields.push("movement_type", "all_boxes");
        values.push(type, categoryBoxes === null ? 1 : 0);
        Object.assign(data, {
          movement_type: type,
          all_boxes: categoryBoxes === null ? 1 : 0,
          box_ids: categoryBoxes,
        });
      }
      if (resource === "subcategories") {
        await active(db, "categories", b.category_id, "Categoria");
        fields.push("category_id");
        values.push(b.category_id);
        data.category_id = b.category_id;
      }
      await db.batch([
        db
          .prepare(
            `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
          )
          .bind(...values),
        ...(categoryBoxes ?? []).map((box) =>
          db
            .prepare(
              "INSERT INTO category_boxes(category_id,box_id) VALUES (?,?)",
            )
            .bind(recordId, box),
        ),
        audit(db, u, "create", resource, recordId, null, data),
      ]);
      return json(data, 201);
    }
    if (method === "PATCH" && id) {
      const before = await db
        .prepare(`SELECT * FROM ${table} WHERE id=?`)
        .bind(id)
        .first<Row>();
      if (!before) fail("Cadastro não encontrado.", 404);
      const data: Row = { ...before };
      delete data.created_by;
      delete before.created_by;
      const fields: string[] = [],
        values: any[] = [];
      if (b.name !== undefined) {
        need(u, `${area}.edit`);
        data.name = text(b.name, "Nome");
        fields.push("name=?");
        values.push(data.name);
      }
      if (b.description !== undefined && resource === "boxes") {
        need(u, `${area}.edit`);
        data.description = text(b.description, "Descrição", true);
        fields.push("description=?");
        values.push(data.description);
      }
      if (b.active !== undefined) {
        need(u, `${area}.deactivate`);
        if (typeof b.active !== "boolean") fail("Situação inválida.");
        data.active = b.active ? 1 : 0;
        fields.push("active=?");
        values.push(data.active);
        if (!b.active && ["accounts", "boxes"].includes(resource)) {
          const check =
            resource === "accounts"
              ? await db
                  .prepare(
                    "SELECT box_id,SUM(amount_cents) AS balance FROM postings WHERE account_id=? GROUP BY box_id HAVING SUM(amount_cents)<>0",
                  )
                  .bind(id)
                  .all()
              : await db
                  .prepare(
                    "SELECT account_id,SUM(amount_cents) AS balance FROM postings WHERE box_id=? GROUP BY account_id HAVING SUM(amount_cents)<>0",
                  )
                  .bind(id)
                  .all();
          if (check.results.length)
            fail("Zere todos os saldos vinculados antes de desativar.");
        }
      }
      let categoryBoxes: string[] | null | undefined;
      if (
        resource === "categories" &&
        (b.movement_type !== undefined || b.box_ids !== undefined)
      ) {
        need(u, "categories.edit");
        before.box_ids = (
          await db
            .prepare("SELECT box_id FROM category_boxes WHERE category_id=?")
            .bind(id)
            .all<Row>()
        ).results.map((r) => r.box_id);
        if (b.movement_type !== undefined) {
          if (!["both", "income", "expense"].includes(b.movement_type))
            fail("Tipo de categoria inválido.");
          fields.push("movement_type=?");
          values.push(b.movement_type);
          data.movement_type = b.movement_type;
        }
        if (b.box_ids !== undefined) {
          categoryBoxes = await boxSelection(db, b.box_ids);
          if (categoryBoxes?.length === 0)
            fail("Selecione ao menos um ministério ou todos.");
          fields.push("all_boxes=?");
          values.push(categoryBoxes === null ? 1 : 0);
          Object.assign(data, {
            all_boxes: categoryBoxes === null ? 1 : 0,
            box_ids: categoryBoxes,
          });
        }
      }
      if (!fields.length) fail("Nenhuma alteração informada.");
      await db.batch([
        db
          .prepare(`UPDATE ${table} SET ${fields.join(",")} WHERE id=?`)
          .bind(...values, id),
        ...(categoryBoxes === undefined
          ? []
          : [
              db
                .prepare("DELETE FROM category_boxes WHERE category_id=?")
                .bind(id),
              ...(categoryBoxes ?? []).map((box) =>
                db
                  .prepare(
                    "INSERT INTO category_boxes(category_id,box_id) VALUES (?,?)",
                  )
                  .bind(id, box),
              ),
            ]),
        audit(db, u, "update", resource, id, before, data),
      ]);
      return json({ ok: true });
    }
  }
  if (resource === "profiles") {
    if (method === "GET") {
      need(u, "profiles.view");
      return json(
        (
          await db
            .prepare(
              "SELECT id,name,description,active,permissions FROM profiles WHERE id<>'system-pending' ORDER BY name",
            )
            .all()
        ).results.map((r) => ({
          ...r,
          permissions: JSON.parse(String(r.permissions)),
        })),
      );
    }
    need(u, "profiles.manage");
    const b = await readBody(req),
      ps = permissions(b.permissions, u),
      name = text(b.name, "Nome"),
      description = text(b.description, "Descrição", true);
    if (method === "POST" && !id) {
      const recordId = uid();
      await db.batch([
        db
          .prepare(
            "INSERT INTO profiles(id,name,description,permissions,created_by,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(recordId, name, description, JSON.stringify(ps), u.id, now()),
        audit(db, u, "create", "profile", recordId, null, {
          name,
          description,
          permissions: ps,
        }),
      ]);
      return json({ id: recordId }, 201);
    }
    if (method === "PATCH" && id) {
      if (
        isAdmin(ps) &&
        (await db
          .prepare(
            "SELECT 1 FROM users WHERE profile_id=? AND box_scope IS NOT NULL",
          )
          .bind(id)
          .first())
      )
        fail(
          "Remova a restrição de ministérios dos usuários antes de tornar este perfil administrativo.",
        );
      const before = await db
        .prepare("SELECT * FROM profiles WHERE id=?")
        .bind(id)
        .first<Row>();
      if (!before || id === "system-pending")
        fail("Perfil não encontrado.", 404);
      const enabled = b.active === undefined ? before.active : b.active ? 1 : 0;
      if (!enabled) {
        const members = await db
          .prepare(
            "SELECT COUNT(*) AS n FROM users WHERE profile_id=? AND active=1",
          )
          .bind(id)
          .first<Row>();
        if (Number(members?.n))
          fail("Há usuários ativos vinculados a este perfil.");
      }
      if (
        isAdmin(JSON.parse(before.permissions)) &&
        (!enabled || !isAdmin(ps)) &&
        (await lastAdmin(db, null, id)) === 0
      )
        fail("Não é possível retirar o acesso do último administrador ativo.");
      await db.batch([
        db
          .prepare(
            "UPDATE profiles SET name=?,description=?,permissions=?,active=? WHERE id=?",
          )
          .bind(name, description, JSON.stringify(ps), enabled, id),
        audit(
          db,
          u,
          "update",
          "profile",
          id,
          {
            name: before.name,
            permissions: JSON.parse(before.permissions),
            active: before.active,
          },
          { name, description, permissions: ps, active: enabled },
        ),
      ]);
      return json({ ok: true });
    }
  }
  if (resource === "users") {
    if (method === "GET") {
      if (!allowed(u, "users.view") && !allowed(u, "users.approve"))
        fail("Seu perfil não permite esta consulta.", 403);
      return json(
        (
          await db
            .prepare(
              "SELECT u.id,u.name,u.login,u.profile_id,u.active,u.must_change,u.approval_state,u.requested_role,u.is_responsible,u.box_scope,p.name AS profile_name FROM users u JOIN profiles p ON p.id=u.profile_id WHERE u.is_master=0 ORDER BY CASE WHEN u.approval_state='pending' THEN 0 ELSE 1 END,u.name",
            )
            .all()
        ).results.filter(
          (row) => allowed(u, "users.view") || row.approval_state === "pending",
        ),
      );
    }
    need(u, "users.manage");
    const b = await readBody(req);
    if (method === "POST" && !id) {
      need(u, "users.approve");
      const profile = await active(db, "profiles", b.profile_id, "Perfil");
      permissions(JSON.parse(profile.permissions), u);
      const boxes = await boxSelection(db, b.box_ids ?? null);
      if (boxes !== null && isAdmin(JSON.parse(profile.permissions)))
        fail("Administradores precisam de acesso a todos os ministérios.");
      const recordId = uid(),
        name = text(b.name, "Nome"),
        login = text(b.login, "Login").toLowerCase();
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,login,password_hash,profile_id,created_by,created_at,box_scope) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            recordId,
            name,
            login,
            await passwordHash(validatePassword(b.password)),
            profile.id,
            u.id,
            now(),
            boxes === null ? null : JSON.stringify(boxes),
          ),
        audit(db, u, "create", "user", recordId, null, {
          name,
          login,
          profile_id: profile.id,
          box_ids: boxes,
        }),
      ]);
      return json({ id: recordId }, 201);
    }
    if (method === "PATCH" && id) {
      const before = await db
        .prepare(
          "SELECT id,name,login,profile_id,active,approval_state,box_scope FROM users WHERE id=? AND is_master=0",
        )
        .bind(id)
        .first<Row>();
      if (!before) fail("Usuário não encontrado.", 404);
      if (before.approval_state !== "approved")
        fail("A solicitação deve ser autorizada no fluxo de aprovação.", 403);
      const profile = await active(
        db,
        "profiles",
        b.profile_id ?? before.profile_id,
        "Perfil",
      );
      permissions(JSON.parse(profile.permissions), u);
      const name = b.name === undefined ? before.name : text(b.name, "Nome"),
        enabled = b.active === undefined ? before.active : b.active ? 1 : 0;
      const oldProfile = await db
        .prepare("SELECT permissions FROM profiles WHERE id=?")
        .bind(before.profile_id)
        .first<Row>();
      if (
        before.active &&
        isAdmin(JSON.parse(oldProfile!.permissions)) &&
        (!enabled || !isAdmin(JSON.parse(profile.permissions))) &&
        (await lastAdmin(db, id, null)) === 0
      )
        fail("Não é possível retirar o acesso do último administrador ativo.");
      const boxes =
        b.box_ids === undefined
          ? before.box_scope === null
            ? null
            : JSON.parse(before.box_scope)
          : await boxSelection(db, b.box_ids);
      if (boxes !== null && isAdmin(JSON.parse(profile.permissions)))
        fail("Administradores precisam de acesso a todos os ministérios.");
      const sets = [
          "box_scope=?",
          "name=?",
          "profile_id=?",
          "active=?",
          "session_version=session_version+1",
        ],
        values: any[] = [
          boxes === null ? null : JSON.stringify(boxes),
          name,
          profile.id,
          enabled,
        ];
      if (b.password !== undefined) {
        sets.push("password_hash=?", "must_change=1");
        values.push(await passwordHash(validatePassword(b.password)));
      }
      await db.batch([
        db
          .prepare(
            `UPDATE users SET ${sets.join(",")} WHERE id=? AND is_master=0`,
          )
          .bind(...values, id),
        audit(
          db,
          u,
          b.password ? "reset_password" : "update",
          "user",
          id,
          before,
          {
            name,
            profile_id: profile.id,
            active: enabled,
            box_ids: boxes,
            ...(b.password ? { temporary_password_reset: true } : {}),
          },
        ),
      ]);
      return json({ ok: true });
    }
  }
  if (path === "/api/settings") {
    if (method === "GET") {
      if (!allowed(u, "opening.create") && !allowed(u, "adjustments.configure"))
        fail("Seu perfil não permite esta consulta.", 403);
      return json({
        adjustment_approval: (await db
          .prepare("SELECT value FROM settings WHERE key='adjustment_approval'")
          .first<Row>())!.value,
      });
    }
    need(u, "adjustments.configure");
    const b = await readBody(req);
    if (!["direct", "dual"].includes(b.adjustment_approval))
      fail("Política inválida.");
    const before = await db
      .prepare("SELECT value FROM settings WHERE key='adjustment_approval'")
      .first<Row>();
    await db.batch([
      db
        .prepare("UPDATE settings SET value=? WHERE key='adjustment_approval'")
        .bind(b.adjustment_approval),
      audit(db, u, "configure", "settings", "adjustment_approval", before, {
        value: b.adjustment_approval,
      }),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/balances" && method === "GET") {
    if (
      !allowed(u, "movements.create") &&
      !allowed(u, "opening.create") &&
      !allowed(u, "dashboard.view")
    )
      fail("Seu perfil não permite esta consulta.", 403);
    return json(await balances(db, u));
  }
  if (resource === "operations") {
    if (method === "GET") {
      need(u, "movements.view");
      const cond = ["1=1"],
        params: string[] = [];
      for (const [key, col] of [
        ["from", "o.movement_date>="],
        ["to", "o.movement_date<="],
        ["account_id", "o.account_id="],
        ["box_id", "o.box_id="],
      ] as const) {
        const v = url.searchParams.get(key);
        if (v) {
          if (key === "from" || key === "to") date(v);
          cond.push(`${col}?`);
          params.push(v);
        }
      }
      cond.push(scopeClause(u, "o.box_id", params));
      const rows = await db
        .prepare(
          `SELECT o.version,o.id,o.number,o.type,o.movement_date,o.description,o.status,o.account_id,o.box_id,o.category_id,o.subcategory_id,o.amount_cents,o.payment_method,o.created_at,a.name AS account_name,b.name AS box_name,c.name AS category_name,sc.name AS subcategory_name,CASE WHEN u.is_master=1 THEN 'Responsável restrito' ELSE u.name END AS author FROM operations o JOIN financial_accounts a ON a.id=o.account_id LEFT JOIN boxes b ON b.id=o.box_id LEFT JOIN categories c ON c.id=o.category_id LEFT JOIN subcategories sc ON sc.id=o.subcategory_id JOIN users u ON u.id=o.created_by WHERE ${cond.join(" AND ")} ORDER BY o.movement_date DESC,o.number DESC LIMIT 500`,
        )
        .bind(...params)
        .all();
      return json(rows.results);
    }
    if (method === "POST" && !id) {
      const b = await readBody(req);
      if (!["opening", "income", "expense"].includes(b.type))
        fail("Tipo de operação indisponível neste incremento.");
      need(u, b.type === "opening" ? "opening.create" : "movements.create");
      const account = await active(
          db,
          "financial_accounts",
          b.account_id,
          "Conta financeira",
        ),
        movementDate = date(b.movement_date),
        description = text(b.description, "Descrição"),
        amount = cents(b.amount_cents, b.type === "opening");
      let box: Row | null = null,
        category: Row | null = null,
        sub: Row | null = null;
      if (b.type !== "opening") {
        box = await active(db, "boxes", b.box_id, "Ministério");
        category = await active(db, "categories", b.category_id, "Categoria");
        needBox(u, box.id);
        await categoryRule(db, category, b.type, box.id);
        if (b.subcategory_id) {
          sub = await active(
            db,
            "subcategories",
            b.subcategory_id,
            "Subcategoria",
          );
          if (sub.category_id !== category.id)
            fail("A subcategoria não pertence à categoria selecionada.");
        }
      }
      if (
        b.type === "expense" &&
        !["cash", "pix", "credit", "debit"].includes(b.payment_method)
      )
        fail("Informe a forma de pagamento.");
      if (b.type === "opening" && account.type === "cash" && amount < 0)
        fail("Dinheiro em espécie não pode ficar negativo.");
      const signed = b.type === "expense" ? -amount : amount;
      const current = await db
        .prepare(
          "SELECT COALESCE(SUM(amount_cents),0) AS total,COALESCE(SUM(CASE WHEN box_id IS ? THEN amount_cents ELSE 0 END),0) AS position FROM postings WHERE account_id=?",
        )
        .bind(box?.id ?? null, account.id)
        .first<Row>();
      if (account.type === "cash" && Number(current!.total) + signed < 0)
        fail("Dinheiro em espécie não pode ficar negativo.");
      if (
        (Number(current!.position) + signed < 0 ||
          Number(current!.total) + signed < 0) &&
        b.confirm_negative !== true
      )
        fail("O saldo ficará negativo. Confira e confirme o aviso.", 409);
      const policy = (await db
        .prepare("SELECT value FROM settings WHERE key='adjustment_approval'")
        .first<Row>())!.value;
      const status =
          b.type === "opening" && policy === "dual" ? "pending" : "effective",
        recordId = uid(),
        at = now();
      const data = {
        id: recordId,
        type: b.type,
        account_id: account.id,
        box_id: box?.id ?? null,
        category_id: category?.id ?? null,
        subcategory_id: sub?.id ?? null,
        movement_date: movementDate,
        description,
        amount_cents: amount,
        status,
        payment_method: b.type === "expense" ? b.payment_method : null,
      };
      const statements = [
        db
          .prepare(
            "INSERT INTO operations(id,number,type,movement_date,description,status,account_id,box_id,category_id,subcategory_id,amount_cents,payment_method,created_by,created_at) VALUES (?,(SELECT COALESCE(MAX(number),0)+1 FROM operations),?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            recordId,
            b.type,
            movementDate,
            description,
            status,
            account.id,
            box?.id ?? null,
            category?.id ?? null,
            sub?.id ?? null,
            amount,
            data.payment_method,
            u.id,
            at,
          ),
      ];
      if (status === "effective")
        statements.push(
          db
            .prepare(
              "INSERT INTO postings(id,operation_id,account_id,box_id,amount_cents,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(uid(), recordId, account.id, box?.id ?? null, signed, at),
        );
      statements.push(
        audit(db, u, "create", "operation", recordId, null, data),
      );
      await db.batch(statements);
      return json(data, 201);
    }
    if (method === "PATCH" && id && path === "/api/operations/" + id) {
      need(u, "movements.edit");
      const b = await readBody(req);
      const before = await db
        .prepare("SELECT * FROM operations WHERE id=?")
        .bind(id)
        .first<Row>();
      if (!before) fail("Movimentação não encontrada.", 404);
      needBox(u, before.box_id);
      if (before.type === "opening" || before.status !== "effective")
        fail("A edição é permitida somente em entradas e saídas efetivadas.");
      if (!Number.isInteger(b.version) || b.version !== before.version)
        fail("A movimentação foi alterada. Reabra para editar.", 409);
      for (const key of ["type", "account_id", "box_id", "status"])
        if (b[key] !== undefined && b[key] !== before[key])
          fail(
            "Tipo, conta, ministério e situação não podem ser alterados nesta edição.",
          );
      const amount = cents(b.amount_cents),
        movementDate = date(b.movement_date),
        description = text(b.description, "Descrição"),
        reason = text(b.reason, "Motivo da correção");
      const category = await active(
        db,
        "categories",
        b.category_id,
        "Categoria",
      );
      await categoryRule(db, category, before.type, before.box_id);
      if (b.subcategory_id) {
        const sub = await active(
          db,
          "subcategories",
          b.subcategory_id,
          "Subcategoria",
        );
        if (sub.category_id !== category.id)
          fail("A subcategoria não pertence à categoria selecionada.");
      }
      const method =
        before.type === "expense"
          ? (b.payment_method ?? before.payment_method)
          : null;
      if (
        before.type === "expense" &&
        !["cash", "pix", "credit", "debit"].includes(method)
      )
        fail("Informe a forma de pagamento.");
      const delta =
        (before.type === "expense" ? -1 : 1) * (amount - before.amount_cents);
      const account = await db
        .prepare("SELECT * FROM financial_accounts WHERE id=?")
        .bind(before.account_id)
        .first<Row>();
      const current = await db
        .prepare(
          "SELECT COALESCE(SUM(amount_cents),0) AS total,COALESCE(SUM(CASE WHEN box_id IS ? THEN amount_cents ELSE 0 END),0) AS position FROM postings WHERE account_id=?",
        )
        .bind(before.box_id, before.account_id)
        .first<Row>();
      if (delta !== 0) {
        await active(
          db,
          "financial_accounts",
          before.account_id,
          "Conta financeira",
        );
        await active(db, "boxes", before.box_id, "Ministério");
        if (account!.type === "cash" && current!.total + delta < 0)
          fail("Dinheiro em espécie não pode ficar negativo.");
        if (
          (current!.total + delta < 0 || current!.position + delta < 0) &&
          b.confirm_negative !== true
        )
          fail("O saldo ficará negativo. Confira e confirme o aviso.", 409);
      }
      const snapshot = (row: Row) =>
        Object.fromEntries(
          [
            "id",
            "number",
            "type",
            "movement_date",
            "description",
            "status",
            "account_id",
            "box_id",
            "category_id",
            "subcategory_id",
            "amount_cents",
            "payment_method",
            "version",
          ].map((k) => [k, row[k]]),
        );
      const after = {
        ...snapshot(before),
        movement_date: movementDate,
        description,
        category_id: category.id,
        subcategory_id: b.subcategory_id || null,
        amount_cents: amount,
        payment_method: method,
        version: before.version + 1,
      };
      const statements = [
        db
          .prepare(
            "UPDATE operations SET movement_date=?,description=?,category_id=?,subcategory_id=?,amount_cents=?,payment_method=?,version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=?",
          )
          .bind(
            movementDate,
            description,
            category.id,
            b.subcategory_id || null,
            amount,
            method,
            b.version,
            id,
          ),
      ];
      // Keep immutable postings: only the difference changes the balance, in the same transaction.
      if (delta !== 0)
        statements.push(
          db
            .prepare(
              "INSERT INTO postings(id,operation_id,account_id,box_id,amount_cents,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(uid(), id, before.account_id, before.box_id, delta, now()),
        );
      statements.push(
        audit(db, u, "update", "operation", id, snapshot(before), {
          ...after,
          reason,
        }),
      );
      await db.batch(statements);
      return json(after);
    }
    if (method === "POST" && id && path.endsWith("/approve")) {
      need(u, "adjustments.approve");
      const op = await db
        .prepare(
          "SELECT * FROM operations WHERE id=? AND status='pending' AND type='opening'",
        )
        .bind(id)
        .first<Row>();
      if (!op) fail("Solicitação pendente não encontrada.", 404);
      if (op.created_by === u.id)
        fail("Você não pode aprovar o próprio ajuste.", 403);
      await active(db, "financial_accounts", op.account_id, "Conta financeira");
      const at = now();
      await db.batch([
        db
          .prepare(
            "INSERT INTO approvals(operation_id,user_id,created_at) VALUES (?,?,?)",
          )
          .bind(id, u.id, at),
        db
          .prepare(
            "INSERT INTO postings(id,operation_id,account_id,box_id,amount_cents,created_at) SELECT ?,id,account_id,NULL,amount_cents,? FROM operations WHERE id=? AND status='pending'",
          )
          .bind(uid(), at, id),
        db
          .prepare(
            "UPDATE operations SET status='effective',approved_by=?,approved_at=? WHERE id=? AND status='pending'",
          )
          .bind(u.id, at, id),
        audit(
          db,
          u,
          "approve",
          "operation",
          id,
          { status: "pending" },
          { status: "effective" },
        ),
      ]);
      return json({ ok: true });
    }
  }
  if (path.startsWith("/api/audit") && method === "GET") {
    need(u, "audit.view");
    const cond = ["a.actor_master=0"],
      params: any[] = [];
    if (scope(u) !== null) {
      // Do not reveal unrelated administration or the previous ministry of a correction.
      cond.push("a.entity='operation'");
      cond.push(
        scopeClause(u, "json_extract(a.after_json,'$.box_id')", params),
      );
      const beforeParams: any[] = [];
      const beforeScope = scopeClause(
        u,
        "json_extract(a.before_json,'$.box_id')",
        beforeParams,
      );
      cond.push("(a.before_json IS NULL OR " + beforeScope + ")");
      params.push(...beforeParams);
    }
    if (path === "/api/audit/options") {
      const rows = (
        await db
          .prepare(
            "SELECT DISTINCT u.id,u.name,a.action FROM audit a JOIN users u ON u.id=a.user_id WHERE " +
              cond.join(" AND ") +
              " ORDER BY u.name",
          )
          .bind(...params)
          .all<Row>()
      ).results;
      return json({
        users: [
          ...new Map(
            rows.map((r) => [r.id, { id: r.id, name: r.name }]),
          ).values(),
        ],
        actions: [...new Set(rows.map((r) => r.action))],
      });
    }
    const from = url.searchParams.get("from"),
      to = url.searchParams.get("to");
    if (from) {
      date(from);
      cond.push("a.created_at>=?");
      params.push(new Date(from + "T00:00:00-03:00").toISOString());
    }
    if (to) {
      date(to);
      cond.push("a.created_at<?");
      params.push(
        new Date(Date.parse(to + "T00:00:00-03:00") + 86400000).toISOString(),
      );
    }
    if (from && to && from > to)
      fail("O início do período deve ser anterior ao fim.");
    for (const [key, col] of [
      ["user_id", "a.user_id"],
      ["action", "a.action"],
    ]) {
      const v = url.searchParams.get(key);
      if (v) {
        cond.push(col + "=?");
        params.push(text(v, key));
      }
    }
    const base =
      "SELECT a.id,a.user_id,a.action,a.entity,a.record_id,a.before_json,a.after_json,a.created_at,u.name AS author FROM audit a JOIN users u ON u.id=a.user_id WHERE " +
      cond.join(" AND ") +
      " ORDER BY a.created_at DESC,a.id DESC";
    if (path === "/api/audit/export") {
      need(u, "audit.export");
      const rows = (
        await db
          .prepare(base + " LIMIT 10001")
          .bind(...params)
          .all<Row>()
      ).results;
      if (rows.length > 10000)
        fail("Refine os filtros para exportar até 10.000 atividades.");
      const cell = (v: unknown) => {
        let value = String(v ?? "");
        if (/^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value))
          value = "'" + value;
        return '"' + value.replaceAll('"', '""') + '"';
      };
      const keys = [
        "created_at",
        "author",
        "action",
        "entity",
        "record_id",
        "before_json",
        "after_json",
      ];
      const csv =
        "\ufeff" +
        [
          [
            "Data UTC",
            "Usuário",
            "Ação",
            "Recurso",
            "Registro",
            "Antes",
            "Depois",
          ],
          ...rows.map((r) => keys.map((k) => r[k])),
        ]
          .map((row) => row.map(cell).join(";"))
          .join("\r\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="historico-atividades.csv"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path !== "/api/audit") fail("Recurso não encontrado.", 404);
    const raw = url.searchParams.get("offset") ?? "0";
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(Number(raw)) ||
      Number(raw) > 1000000
    )
      fail("Página inválida.");
    const rows = (
      await db
        .prepare(base + " LIMIT 100 OFFSET ?")
        .bind(...params, Number(raw))
        .all<Row>()
    ).results;
    return json(rows);
  }
  fail("Recurso não encontrado.", 404);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (error) {
      if (error instanceof Failure)
        return json({ error: error.message }, error.status);
      const message = String(error);
      const guards: Record<string, string> = {
        operation_version:
          "A movimentação foi alterada por outra pessoa. Reabra para editar.",
        CASH_NEGATIVE: "Dinheiro em espécie não pode ficar negativo.",
        LAST_ADMIN:
          "Não é possível retirar o acesso do último administrador ativo.",
        ACCOUNT_BALANCE_NOT_ZERO:
          "Zere todos os saldos da conta antes de desativar.",
        BOX_BALANCE_NOT_ZERO:
          "Zere os saldos do ministério em cada conta antes de desativar.",
        ACCOUNT_INACTIVE: "A conta financeira está inativa.",
        BOX_INACTIVE: "O ministério está inativo.",
        PROFILE_ACTIVE_USERS: "Há usuários ativos vinculados a este perfil.",
      };
      for (const [key, value] of Object.entries(guards))
        if (message.includes(key)) return json({ error: value }, 409);
      if (message.includes("UNIQUE constraint"))
        return json(
          {
            error:
              "Já existe um registro com essa identificação, aprovação ou saldo de abertura para esta conta.",
          },
          409,
        );
      console.error(
        "Falha interna",
        message.replace(/password[^,]*/gi, "[redigido]"),
      );
      return json(
        {
          error:
            "Não foi possível concluir a operação. Nenhuma alteração parcial foi confirmada.",
        },
        500,
      );
    }
  },
};
