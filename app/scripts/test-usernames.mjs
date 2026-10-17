import assert from "node:assert/strict";
import {
  isValidUsername,
  normalizeUsername,
  usernamePattern,
} from "../lib/usernames.ts";

// HTML uses Unicode Sets mode, while server validation uses Unicode mode.
const browserPattern = new RegExp(`^(?:${usernamePattern})$`, "v");
for (const name of [
  "禾草卷卷",
  "张三",
  "𠀀𠀁",
  "辩友_A12",
  "Alice.2026",
  "member-123",
  "中".repeat(32),
  "𠀀".repeat(32),
]) {
  assert.ok(isValidUsername(normalizeUsername(name)), name);
  assert.ok(browserPattern.test(name), `browser accepts ${name}`);
}
for (const name of [
  "",
  "禾",
  "_中文",
  "中文 空格",
  "中文\n名字",
  "中文😀",
  "<中文>",
  "中".repeat(33),
  "𠀀".repeat(33),
]) {
  assert.equal(isValidUsername(name), false, name);
  assert.equal(browserPattern.test(name), false, `browser rejects ${name}`);
}
assert.equal(normalizeUsername("  禾草ABC  "), "禾草abc");
assert.equal(normalizeUsername("Existing-Account_01"), "existing-account_01");
console.log(
  "Chinese, mixed, and existing English usernames pass matching browser/server validation; spaces, symbols, and invalid lengths are rejected.",
);
