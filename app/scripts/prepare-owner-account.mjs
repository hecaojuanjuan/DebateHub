import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { QRCodeSVG } from "qrcode.react";

const { values } = parseArgs({
  options: {
    origin: { type: "string", default: "https://debatehub-unnc.pages.dev" },
  },
});
const origin = new URL(values.origin).origin;
if (
  ![
    "https://debatehub-unnc.pages.dev",
    "https://debatehub-unnc.hecaojuanjuan.workers.dev",
  ].includes(origin) &&
  !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
)
  throw new Error("Use the known DebateHub deployment or a local preview.");
const { ADMIN_KEY: key } = parseEnv(
  await readFile(new URL("../.dev.vars", import.meta.url), "utf8"),
);
if (!key) throw new Error("Configure the existing ADMIN_KEY first.");
let cookie = "";
async function call(path, body) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json", cookie },
    ...(body ? { body: JSON.stringify({ communityId: "unnc", ...body }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  const next = response.headers.get("set-cookie");
  if (next) cookie = next.split(";")[0];
  return result;
}
try {
  await call("admin/login", { key });
  const state = await call("state");
  if (state.viewer?.role !== "owner")
    throw new Error("The initial owner session was not established.");
  if (state.viewer.username)
    throw new Error(
      "The owner has already set a username. Use the existing account.",
    );
  const { token, expiresAt } = await call("auth/setup-link", {});
  const url = `${origin}/c/unnc#setup=${token}`;
  const expires = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(expiresAt);
  const output = new URL("../outputs/", import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("owner-account.md", output),
    `# 宁诺例辩 · 群主账号设置\n\n[点击设置你的群主账号](${url})\n\n此入口仅供负责人本人使用，请勿转发。有效期至北京时间 ${expires}，设置成功后立即失效。\n\n填写社区昵称、用户名和密码后，会进入宁诺例辩并保留原有群主身份。用户名用于登录，社区昵称用于发言。以后在手机或电脑上打开 ${origin}，点击「登录 / 注册」即可登录。\n\n用户名：2–32 个字符，支持中文、英文字母、数字、点、下划线或短横线，以中文、字母或数字开头，不含空格。密码：10–128 字符。请妥善保存，当前暂不支持自动找回。\n`,
  );
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: url,
      size: 512,
      marginSize: 4,
      level: "M",
    }),
  );
  await writeFile(new URL("owner-account.svg", output), svg);
  const require = createRequire(import.meta.url);
  const wranglerRequire = createRequire(
    require.resolve("wrangler/package.json"),
  );
  const miniflareRequire = createRequire(
    wranglerRequire.resolve("miniflare/package.json"),
  );
  await miniflareRequire("sharp")(Buffer.from(svg))
    .png()
    .toFile(fileURLToPath(new URL("owner-account.png", output)));
  await writeFile(
    new URL("owner-account.json", output),
    JSON.stringify({ url, expiresAt, userId: state.viewer.id }, null, 2),
  );
  console.log(
    `Owner setup prepared. Expires ${expires} Asia/Shanghai. Open app/outputs/owner-account.md or its QR code; keep both private.`,
  );
} finally {
  if (cookie) await call("logout", {}).catch(() => {});
}
