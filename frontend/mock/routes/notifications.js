const state = require('../lib/state');
const { HttpError, paginate } = require('../lib/util');
const dto = ({ userId, ...n }) => n;
const mine = (u) => state.notifications.filter((n) => n.userId === u.id);
module.exports = [
  { method: 'GET', pattern: '/api/notifications/unread-count', handler: ({ auth }) => ({ count: mine(auth()).filter((n) => !n.read).length }) },
  { method: 'POST', pattern: '/api/notifications/read-all', handler: ({ auth }) => { let c = 0; mine(auth()).forEach((n) => { if (!n.read) { n.read = true; c++; } }); return { updated: c }; } },
  { method: 'GET', pattern: '/api/notifications', handler: ({ auth, query }) => {
    let l = mine(auth()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query.unreadOnly === 'true') l = l.filter((n) => !n.read);
    const p = paginate(l, { size: 20, ...query }); return { ...p, content: p.content.map(dto) };
  } },
  { method: 'POST', pattern: '/api/notifications/:id/read', handler: ({ auth, params }) => {
    const n = mine(auth()).find((x) => x.id === Number(params.id)); if (!n) throw new HttpError(404, 'Notification not found');
    n.read = true; return dto(n);
  } },
];
