export const usernamePattern =
  "[\\p{Script=Han}a-zA-Z0-9][\\p{Script=Han}a-zA-Z0-9_.\\-]{1,31}";
export const usernameHint =
  "2–32 个字符，支持中文、英文字母、数字、点、下划线和短横线；以中文、字母或数字开头，不含空格";
const validUsername = new RegExp(`^(?:${usernamePattern})$`, "u");

export const normalizeUsername = (value: string) =>
  value.trim().normalize("NFC").toLowerCase();
export const isValidUsername = (value: string) => validUsername.test(value);
