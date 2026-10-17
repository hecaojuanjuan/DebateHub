import assert from "node:assert/strict";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5185";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
  throw new Error("Run cache regression tests against a local preview only.");
const url = `${origin}/api/state?community=unnc`;
const initial = await fetch(url);
assert.equal(initial.status, 200);
const tag = initial.headers.get("ETag");
assert.ok(tag);
await initial.text();
for (const value of [tag, `W/${tag}`, `"unrelated", W/${tag}`, "*"]) {
  const response = await fetch(url, { headers: { "If-None-Match": value } });
  assert.equal(response.status, 304, value);
  assert.equal(await response.text(), "");
}
const different = await fetch(url, {
  headers: { "If-None-Match": 'W/"different"' },
});
assert.equal(different.status, 200);
await different.text();
console.log(
  "Conditional API reads accept strong, compression-weakened, listed, and wildcard validators; changed tags still return data.",
);
