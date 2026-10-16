// Mirrors backend app/schemas/auth.py::check_password_strength.
export const PASSWORD_RULES = [
  { key: "len",     label: "At least 6 characters",  test: (pw) => pw.length >= 6 },
  { key: "upper",   label: "One uppercase letter",   test: (pw) => /[A-Z]/.test(pw) },
  { key: "number",  label: "One number",             test: (pw) => /\d/.test(pw) },
  { key: "special", label: "One special character",  test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

export const isStrongPassword = (pw) => PASSWORD_RULES.every((r) => r.test(pw || ""));
