// Auth + profile: register / login / me / update profile / change password.
const state = require('../lib/state');
const { HttpError, reply, fieldErrors, signJwt, toNaive } = require('../lib/util');

const EMAIL = /^\S+@\S+\.\S+$/;
const tokenFor = (u) => {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  return { token: signJwt({ sub: u.email, uid: u.id, role: u.role, exp }), tokenType: 'Bearer', expiresAt: toNaive(state.nowMs() + 12 * 3600000), user: state.publicUser(u) };
};

module.exports = [
  { method: 'POST', pattern: '/api/auth/register', handler: ({ body }) => {
    const errs = [];
    if (!body.fullName?.trim()) errs.push(['fullName', 'Full name is required']);
    if (!body.email?.trim()) errs.push(['email', 'Email is required']); else if (!EMAIL.test(body.email)) errs.push(['email', 'Email is not valid']);
    if (!body.password) errs.push(['password', 'Password is required']);
    else if (body.password.length < 8 || body.password.length > 64) errs.push(['password', 'Password must be 8-64 characters']);
    else if (!/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) errs.push(['password', 'Password must contain a letter and a digit']);
    if (errs.length) throw fieldErrors(errs);
    if (state.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) throw new HttpError(409, 'An account with this email already exists', { fieldErrors: [{ field: 'email', message: 'Email already registered' }] });
    const u = { id: state.nextId('user'), fullName: body.fullName.trim(), email: body.email.trim(), password: body.password, phone: body.phone || null, role: 'USER', city: body.city || null, operatorId: null, operatorName: null, fleetId: null, fleetName: null, reminderEnabled: true, reminderLeadHours: 12, noShowCount: 0, walletBalance: 0, homeLat: null, homeLon: null, status: 'ACTIVE', createdAt: state.now() };
    state.users.push(u); state.wallets.set(u.id, { txns: [] });
    return reply(201, state.publicUser(u));
  } },
  { method: 'POST', pattern: '/api/auth/login', handler: ({ body }) => {
    const errs = [];
    if (!body.email) errs.push(['email', 'Email is required']); if (!body.password) errs.push(['password', 'Password is required']);
    if (errs.length) throw fieldErrors(errs);
    const u = state.users.find((x) => x.email.toLowerCase() === String(body.email).toLowerCase());
    if (!u || u.password !== body.password) throw new HttpError(401, 'Invalid email or password');
    if (u.status === 'BLOCKED') throw new HttpError(403, 'Your account has been blocked. Contact support.');
    return tokenFor(u);
  } },
  { method: 'GET', pattern: '/api/auth/me', handler: ({ auth }) => state.publicUser(auth()) },
  { method: 'PUT', pattern: '/api/users/me', handler: ({ auth, body }) => {
    const u = auth();
    if (!body.fullName?.trim()) throw fieldErrors([['fullName', 'Full name is required']]);
    if (body.reminderLeadHours !== undefined && body.reminderLeadHours !== null && (body.reminderLeadHours < 1 || body.reminderLeadHours > 72)) throw fieldErrors([['reminderLeadHours', 'must be between 1 and 72']]);
    for (const k of ['fullName', 'phone', 'city', 'homeLat', 'homeLon', 'reminderEnabled', 'reminderLeadHours']) if (body[k] !== undefined) u[k] = body[k];
    return state.publicUser(u);
  } },
  { method: 'POST', pattern: '/api/auth/change-password', handler: ({ auth, body }) => {
    const u = auth();
    if (u.password !== body.currentPassword) throw new HttpError(400, 'Current password is incorrect', { fieldErrors: [{ field: 'currentPassword', message: 'Current password is incorrect' }] });
    if (!body.newPassword || body.newPassword.length < 8 || !/[A-Za-z]/.test(body.newPassword) || !/\d/.test(body.newPassword)) throw fieldErrors([['newPassword', 'Password must be 8-64 characters with a letter and a digit']]);
    u.password = body.newPassword; return { message: 'Password changed' };
  } },
];
