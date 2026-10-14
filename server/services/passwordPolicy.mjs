// Phase 1 / P1.2 — password policy utility.
// Central validation used by every path that sets a password
// (register, change-password, admin reset). Persian error messages to match
// the rest of the API. Tunable via env:
//   PASSWORD_MIN_LENGTH      (default 8)
//   PASSWORD_REQUIRE_COMPLEX (default 1 → need upper+lower+digit)

export function validatePassword(password) {
  const errors = [];
  const minLen = parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
  const requireComplex = process.env.PASSWORD_REQUIRE_COMPLEX !== '0';

  if (!password || typeof password !== 'string' || password.length < minLen) {
    errors.push(`رمز عبور باید حداقل ${minLen} کاراکتر باشد`);
  } else if (requireComplex) {
    if (!/[A-Z]/.test(password)) errors.push('رمز عبور باید شامل حداقل یک حرف بزرگ باشد');
    if (!/[a-z]/.test(password)) errors.push('رمز عبور باید شامل حداقل یک حرف کوچک باشد');
    if (!/[0-9]/.test(password)) errors.push('رمز عبور باید شامل حداقل یک رقم باشد');
  }

  return { ok: errors.length === 0, errors };
}

export default { validatePassword };
