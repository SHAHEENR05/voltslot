const state = require('../lib/state');
module.exports = [
  { method: 'GET', pattern: '/api/reference/connectors', handler: () => state.ref.connectors },
  { method: 'GET', pattern: '/api/reference/vehicle-models', handler: () => state.ref.vehicleModels },
  { method: 'GET', pattern: '/api/reference/amenities', handler: () => state.ref.amenities },
  { method: 'GET', pattern: '/api/reference/zones', handler: () => state.ref.zones },
  { method: 'GET', pattern: '/api/reference/pricing-bands', handler: () => state.ref.pricingBands },
];
