const state = require('../lib/state');
const { fieldErrors, paginate, reply } = require('../lib/util');
const wallet = (u) => state.wallets.get(u.id) || { txns: [] };
module.exports = [
  { method: 'GET', pattern: '/api/wallet', handler: ({ auth }) => { const u = auth(); return { balance: u.walletBalance, recent: wallet(u).txns.slice(0, 5) }; } },
  { method: 'GET', pattern: '/api/wallet/transactions', handler: ({ auth, query }) => paginate(wallet(auth()).txns, { size: 10, ...query }) },
  { method: 'POST', pattern: '/api/wallet/topup', handler: ({ auth, body }) => {
    const u = auth(); const amt = Number(body.amount);
    if (!body.amount || Number.isNaN(amt)) throw fieldErrors([['amount', 'Amount is required']]);
    if (amt < 100) throw fieldErrors([['amount', 'Minimum top-up is 100']]);
    if (amt > 50000) throw fieldErrors([['amount', 'Maximum top-up is 50,000']]);
    state.addTxn(u.id, 'TOPUP', amt, `Top-up via ${body.method || 'UPI'}`);
    return { balance: u.walletBalance, recent: wallet(u).txns.slice(0, 5) }; // real backend: 200 + WalletDto
  } },
];
