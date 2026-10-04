import { createContext, useContext } from 'react';
import { useAsync } from './hooks.js';
import { api } from './api.js';

const RefCtx = createContext({ connectors: [], vehicleModels: [], amenities: [], zones: [], pricingBands: [], loading: true });

/** useReference() -> { connectors, vehicleModels, amenities, zones, pricingBands, loading }  (public data, fetched once) */
export function ReferenceProvider({ children }) {
  const { data, loading } = useAsync(async () => {
    const [connectors, vehicleModels, amenities, zones, pricingBands] = await Promise.all(
      ['connectors', 'vehicle-models', 'amenities', 'zones', 'pricing-bands'].map((p) => api.get(`/reference/${p}`, null, { auth: false }).catch(() => [])));
    return { connectors, vehicleModels, amenities, zones, pricingBands };
  }, []);
  return <RefCtx.Provider value={{ connectors: [], vehicleModels: [], amenities: [], zones: [], pricingBands: [], ...(data || {}), loading }}>{children}</RefCtx.Provider>;
}
export const useReference = () => useContext(RefCtx);
