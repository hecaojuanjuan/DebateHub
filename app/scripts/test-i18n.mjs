import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const results = path.join(root, "test-results");
await mkdir(results, { recursive: true });
const temporary = await mkdtemp(path.join(results, "i18n-"));
for (const name of ["messages", "core", "errors"]) {
  const source = await readFile(
    path.join(root, "lib/i18n", `${name}.ts`),
    "utf8",
  );
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
  await writeFile(path.join(temporary, `${name}.mjs`), compiled);
}
const {
  translate,
  resolveLocale,
  preferredLocale,
  localizedUrl,
  communityName,
  communityDescription,
} = await import(pathToFileURL(path.join(temporary, "core.mjs")).href);
const { messages } = await import(
  pathToFileURL(path.join(temporary, "messages.mjs")).href
);
const { errorMessages, translateError } = await import(
  pathToFileURL(path.join(temporary, "errors.mjs")).href
);
let checks = 0;
function check(test, name) {
  assert.ok(test, name);
  checks++;
  console.log(`PASS ${name}`);
}

check(
  resolveLocale({
    query: "en",
    cookie: "zh",
    stored: "zh",
    languages: "zh-CN",
  }) === "en",
  "shared language links override saved preferences",
);
check(
  resolveLocale({ cookie: "zh", stored: "en", languages: "en-US" }) === "zh",
  "a saved preference overrides the browser language",
);
check(
  resolveLocale({ stored: "en", languages: "zh-CN" }) === "en",
  "stored language works when cookies are unavailable",
);
check(
  resolveLocale({
    query: "invalid",
    cookie: "invalid",
    languages: "en-US,en;q=0.9",
  }) === "en",
  "invalid choices fall back to a supported browser language",
);
check(
  preferredLocale("fr-FR,en-US;q=0.6,zh-CN;q=0.9") === "zh" &&
    preferredLocale("en;q=0,zh;q=0.5") === "zh",
  "weighted language preferences and excluded languages are respected",
);
check(
  translate("en", "Posting as {name}", { name: "中文名字 <script>" }) ===
    "Posting as 中文名字 <script>",
  "interpolation preserves names as data without translating or evaluating them",
);
check(
  translate("zh", "Pending requests: {count}", { count: 12 }) ===
    "12 条申请待审核",
  "interpolated messages use natural Chinese order",
);
for (const [en, zh] of Object.entries(messages)) {
  const variables = (text) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  assert.deepEqual(variables(en), variables(zh), en);
  assert.ok(en.length && zh.length);
}
check(true, "every message has matching translation placeholders");
const invitation = new URL(
  localizedUrl(
    "https://example.com/c/club?ref=qr#invite=synthetic-token",
    "en",
  ),
);
check(
  invitation.searchParams.get("lang") === "en" &&
    invitation.searchParams.get("ref") === "qr" &&
    invitation.hash === "#invite=synthetic-token",
  "localized invitations preserve the community, token, and existing parameters",
);
check(
  communityName("宁诺例辩", "unnc", "en") === "UNNC Debate" &&
    communityName("用户自定义社群", "club", "en") === "用户自定义社群",
  "only the built-in community label is translated",
);
check(
  communityDescription("用户自己填写的描述", "unnc", "en") ===
    "用户自己填写的描述",
  "community descriptions written by members stay unchanged",
);
check(
  translateError("用户名或密码不正确", "en") ===
    "Incorrect username or password." &&
    translateError("辩题需为 5–120 个字符", "en") ===
      "Motion must contain 5–120 characters.",
  "authentication and dynamic validation errors have useful English messages",
);
check(
  translateError("Failed to fetch", "zh") === "连接失败，请重试" &&
    translateError("The operation was aborted due to timeout", "en").startsWith(
      "Connection timed out",
    ),
  "network and timeout errors follow the selected language",
);

for (const file of [
  "components/debate-app.tsx",
  "components/community-modals.tsx",
  "components/member-manager.tsx",
]) {
  const source = ts.createSourceFile(
    file,
    await readFile(path.join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const missing = [];
  function inspect(node) {
    if (
      (ts.isStringLiteral(node) || ts.isJsxText(node)) &&
      /[\p{Script=Han}]/u.test(node.text)
    )
      missing.push(node.text.trim());
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  assert.deepEqual(missing, [], file);
}
check(
  true,
  "discussion, account, invitation, and management interfaces have no untranslated Chinese literals",
);
for (const file of [
  "lib/server.ts",
  "lib/state.ts",
  "lib/accounts.ts",
  "lib/membership-management.ts",
  "lib/topic-management.ts",
  "lib/realtime.ts",
  "app/api/[...path]/route.ts",
]) {
  const source = ts.createSourceFile(
    file,
    await readFile(path.join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function inspect(node) {
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(source) === "ApiError"
    ) {
      const argument = node.arguments?.[1];
      if (
        argument &&
        ts.isStringLiteral(argument) &&
        /[\p{Script=Han}]/u.test(argument.text)
      )
        assert.ok(
          errorMessages[argument.text] ||
            !/[\p{Script=Han}]/u.test(translateError(argument.text, "en")),
          argument.text,
        );
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
check(
  true,
  "every current API error has an English translation without changing the API contract",
);

if (process.env.TEST_ORIGIN) {
  const origin = process.env.TEST_ORIGIN;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
    throw new Error("Use a local preview for SSR language tests.");
  for (const test of [
    {
      url: "/c/unnc?lang=en",
      cookie: "zh",
      browser: "zh-CN",
      language: "en-US",
      heading: "Every perspective",
    },
    {
      url: "/c/unnc?lang=zh",
      cookie: "en",
      browser: "en-US",
      language: "zh-CN",
      heading: "每一种立场",
    },
    {
      url: "/c/unnc",
      cookie: "en",
      browser: "zh-CN",
      language: "en-US",
      heading: "Every perspective",
    },
    {
      url: "/",
      cookie: "zh",
      browser: "en-US",
      language: "zh-CN",
      heading: "每一种立场",
    },
    {
      url: "/c/unnc",
      cookie: "",
      browser: "en-US",
      language: "en-US",
      heading: "Every perspective",
    },
  ]) {
    const response = await fetch(origin + test.url, {
      headers: {
        Cookie: `debate_language=${test.cookie}`,
        "Accept-Language": test.browser,
      },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, test.url);
    const html = await response.text();
    assert.ok(
      html.includes(`class="app-shell" lang="${test.language}"`),
      test.url,
    );
    const heading = html
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
      .replace(/<[^>]*>/g, "");
    assert.ok(heading?.includes(test.heading), test.url);
  }
  check(
    true,
    "server-rendered entry pages honor shared links, saved language, and browser preferences",
  );
}
console.log(`${checks} localization checks passed.`);
