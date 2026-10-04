// Route registry. Exports an array of { method, pattern, handler } built by auto-loading EVERY other *.js file in this folder.
// To add routes: create routes/<area>.js with `module.exports = [ { method:'GET', pattern:'/api/x/:id', handler:(ctx)=>... } ]`.
// Handler ctx: { req, res, params, query, body, user, auth(...roles), state, util }  -> return JSON-able value (200) or reply(status, body).
// Throw new HttpError(status, message, { fieldErrors, alternatives }) for errors. Files load alphabetically; first matching route wins.
const fs = require('fs');
const path = require('path');

const routes = [];
for (const f of fs.readdirSync(__dirname).sort()) {
  if (f === 'index.js' || !f.endsWith('.js')) continue;
  const mod = require(path.join(__dirname, f));
  const list = Array.isArray(mod) ? mod : mod.routes || [];
  list.forEach((r) => routes.push({ ...r, source: f }));
}
module.exports = routes;
