import { pbkdf2, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export class PasswordCapacityError extends Error {}
let active = 0;
const queue: (() => void)[] = [];
function passwordWork<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (queue.length >= 128) {
      reject(new PasswordCapacityError());
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(timeout);
      active++;
      void work()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < 2) start();
    else {
      queue.push(start);
      timeout = setTimeout(() => {
        const position = queue.indexOf(start);
        if (position >= 0) queue.splice(position, 1);
        reject(new PasswordCapacityError());
      }, 30_000);
    }
  });
}

const iterations = 600000;
const deriveLegacy = (password: string, salt: Buffer) =>
  passwordWork(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, salt, iterations, 32, "sha256", (error, key) =>
          error ? reject(error) : resolve(key),
        );
      }),
  );

// Keep the existing work factor, but bound memory use during a login burst.
const derive = (password: string, salt: Buffer) =>
  passwordWork(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(
          password,
          salt,
          32,
          { N: 16384, r: 8, p: 5, maxmem: 33554432 },
          (error, key) => (error ? reject(error) : resolve(key)),
        );
      }),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(32);
  const key = await derive(password, salt);
  return `scrypt$16384$8$5$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Unknown usernames still perform the same password derivation.
const dummyHash = `scrypt$16384$8$5$${Buffer.alloc(32).toString("base64")}$${Buffer.alloc(32).toString("base64")}`;
export async function verifyPassword(password: string, encoded?: string) {
  const parts = (encoded || dummyHash).split("$");
  let key: Buffer;
  let expected: string;
  if (
    parts[0] === "scrypt" &&
    parts[1] === "16384" &&
    parts[2] === "8" &&
    parts[3] === "5" &&
    parts.length === 6
  ) {
    key = await derive(password, Buffer.from(parts[4], "base64"));
    expected = parts[5];
  } else if (
    parts[0] === "pbkdf2-sha256" &&
    Number(parts[1]) === iterations &&
    parts.length === 4
  ) {
    // Preserve credentials created in local previews before the runtime limit was found.
    key = await deriveLegacy(password, Buffer.from(parts[2], "base64"));
    expected = parts[3];
  } else return false;
  const other = Buffer.from(expected, "base64");
  return key.length === other.length && timingSafeEqual(key, other);
}
