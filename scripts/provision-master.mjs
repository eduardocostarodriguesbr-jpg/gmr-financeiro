
import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PRODUCTION_DATABASE = "gmr-financeiro-prod";

const quote = (value) =>
  `'${String(value).replaceAll("'", "''")}'`;

export async function provisionMaster({
  persistTo,
  login = "master.gmr",
  password,
  permissions,
  remote = false,
  confirmation,
} = {}) {
  if (remote && persistTo) {
    throw new Error(
      "O parâmetro persistTo não pode ser utilizado em produção.",
    );
  }

  if (remote && confirmation !== PRODUCTION_DATABASE) {
    throw new Error(
      "Provisionamento remoto não autorizado. Confirmação inválida.",
    );
  }

  const wrangler = resolve(
    "node_modules/wrangler/bin/wrangler.js",
  );

  const args = [
    "d1",
    "execute",
    remote ? PRODUCTION_DATABASE : "DB",
    remote ? "--remote" : "--local",
    ...(persistTo ? ["--persist-to", persistTo] : []),
  ];

  const check = spawnSync(
    process.execPath,
    [
      wrangler,
      ...args,
      "--command",
      "SELECT login FROM users WHERE is_master=1",
      "--json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
      },
    },
  );

  if (check.status !== 0) {
    throw new Error(
      "Não foi possível consultar o banco de dados. " +
        "Verifique a autenticação e as migrations. " +
        (check.stderr ?? ""),
    );
  }

  const parsed = JSON.parse(
    check.stdout.slice(check.stdout.indexOf("[")),
  );

  if (parsed.some((result) => result.results?.length)) {
    throw new Error(
      "O Master já existe. Nenhuma senha ou dado foi alterado.",
    );
  }

  const secret =
    password ?? "Gmr!" + randomBytes(18).toString("base64url");

  const salt = randomBytes(16);

  const hash = `pbkdf2$100000$${salt.toString("base64")}$${pbkdf2Sync(
    secret,
    salt,
    100000,
    32,
    "sha256",
  ).toString("base64")}`;

  const id = randomUUID();
  const at = new Date().toISOString();

  const adminPermissions = permissions ?? [
    "accounts.view",
    "accounts.create",
    "accounts.edit",
    "accounts.deactivate",
    "boxes.view",
    "boxes.create",
    "boxes.edit",
    "boxes.deactivate",
    "categories.view",
    "categories.create",
    "categories.edit",
    "categories.deactivate",
    "users.view",
    "users.manage",
    "users.approve",
    "profiles.view",
    "profiles.manage",
    "movements.view",
    "movements.create",
    "dashboard.view",
    "audit.view",
    "opening.create",
    "adjustments.approve",
    "adjustments.configure",
    "institution.manage",
  ];

  const sql = `
INSERT INTO profiles(
  id,
  name,
  description,
  permissions,
  created_at
)
SELECT
  'system-administrator',
  'Administrador',
  'Administração da instituição',
  ${quote(JSON.stringify(adminPermissions))},
  ${quote(at)}
WHERE NOT EXISTS(
  SELECT 1
  FROM profiles
  WHERE name='Administrador' COLLATE NOCASE
);

INSERT INTO users(
  id,
  name,
  login,
  password_hash,
  is_master,
  must_change,
  created_at
)
VALUES (
  ${quote(id)},
  'Proprietário',
  ${quote(login)},
  ${quote(hash)},
  1,
  1,
  ${quote(at)}
);

INSERT INTO audit(
  id,
  user_id,
  actor_master,
  action,
  entity,
  record_id,
  after_json,
  created_at
)
VALUES (
  ${quote(randomUUID())},
  ${quote(id)},
  1,
  'provision_master',
  'user',
  ${quote(id)},
  '{"provisioned":true}',
  ${quote(at)}
);
`;

  const folder =
    persistTo ?? resolve(".wrangler", "provision");

  await mkdir(folder, { recursive: true });

  const file = resolve(
    folder,
    `master-hash-${randomUUID()}.sql`,
  );

  try {
    await writeFile(file, sql, {
      mode: 0o600,
      flag: "wx",
    });

    const result = spawnSync(
      process.execPath,
      [
        wrangler,
        ...args,
        "--file",
        file,
        "--json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
        },
      },
    );

    if (result.status !== 0) {
      throw new Error(
        "Falha no provisionamento: " +
          (result.stderr ?? ""),
      );
    }
  } finally {
    await unlink(file).catch(() => {});
  }

  return {
    login,
    password: secret,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const cliArgs = process.argv.slice(2);

    if (cliArgs.some((arg) => arg !== "--remote")) {
      throw new Error("Parâmetro desconhecido.");
    }

    const remote = cliArgs.includes("--remote");

    let confirmation;

    if (remote) {
      console.log("");
      console.log("ATENÇÃO: AMBIENTE DE PRODUÇÃO");
      console.log("Banco: " + PRODUCTION_DATABASE);
      console.log(
        "Esta operação criará o usuário Master no banco remoto.",
      );
      console.log("");

      const rl = createInterface({
        input: stdin,
        output: stdout,
      });

      try {
        confirmation = await rl.question(
          "Digite gmr-financeiro-prod para confirmar: ",
        );
      } finally {
        rl.close();
      }

      if (confirmation !== PRODUCTION_DATABASE) {
        console.log("Operação cancelada.");
        process.exit(1);
      }
    }

    const result = await provisionMaster({
      remote,
      confirmation,
    });

    console.log("");
    console.log(
      remote
        ? "Master de produção provisionado."
        : "Master local provisionado.",
    );
    console.log(
      "Troca de senha obrigatória no primeiro acesso.",
    );
    console.log("Login: " + result.login);
    console.log("Senha temporária: " + result.password);
    console.log("");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}