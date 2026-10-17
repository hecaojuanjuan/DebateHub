import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";

// Model the production limit that is absent from the newer local runtime.
const originalPbkdf2 = crypto.pbkdf2;
crypto.pbkdf2 = (...args) => {
  if (args[2] > 100000)
    throw new Error("Production PBKDF2 iteration limit exceeded");
  return originalPbkdf2(...args);
};
syncBuiltinESMExports();
const { hashPassword, verifyPassword } = await import("../lib/passwords.ts");
const password = "  一个保留首尾空格的长密码 🔐  ";
const first = await hashPassword(password);
const second = await hashPassword(password);
assert.notEqual(first, second, "equal passwords must use independent salts");
assert.equal(await verifyPassword(password, first), true);
assert.equal(await verifyPassword(password.trim(), first), false);
assert.equal(await verifyPassword("a different long password", first), false);
assert.equal(await verifyPassword(password), false);
console.log(
  "Password hashing and verification pass with the production PBKDF2 limit; Unicode and spaces are preserved; salts are independent.",
);
