import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Skeleton from './Skeleton.jsx';
import EmptyState from './EmptyState.jsx';

/**
 * Table helper (house style: first column "Sr No", centred bold headers, numeric cells right-aligned, text left).
 * <Table columns={[{key,header,numeric?,render?(row,i),sortable?,width?}]} rows={[]} rowKey="id" onRowClick loading
 *        serial={true} startIndex={page*size} empty={<EmptyState/>} compact />
 * Client-side sorting is applied to sortable columns (uses row[key] unless sortValue(row) is given).
 */
export default function Table({ columns, rows, rowKey = 'id', onRowClick, loading, serial = true, startIndex = 0, empty, compact, defaultSort }) {
  const [sort, setSort] = useState(defaultSort || null);
  const data = useMemo(() => {
    if (!rows) return [];
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? '')); return sort.dir === 'asc' ? c : -c; });
  }, [rows, sort, columns]);
  const toggle = (c) => c.sortable && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.numeric ? 'desc' : 'asc' }));
  return (
    <div className="table-wrap">
      <table className={`table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            {serial && <th style={{ width: 56 }}>Sr No</th>}
            {columns.map((c) => (
              <th key={c.key} className={`${c.sortable ? 'sortable' : ''} ${c.numeric ? 'num' : ''}`} style={{ width: c.width, textAlign: 'center' }} onClick={() => toggle(c)}>
                <span className="row gap-4" style={{ justifyContent: 'center', display: 'inline-flex' }}>{c.header}{sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }, (_, i) => <tr key={i}>{Array.from({ length: columns.length + (serial ? 1 : 0) }, (_, j) => <td key={j}><Skeleton h={14} /></td>)}</tr>)}
          {!loading && data.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {serial && <td className="num muted">{startIndex + i + 1}</td>}
              {columns.map((c) => <td key={c.key} className={c.numeric ? 'num' : ''}>{c.render ? c.render(r, i) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && data.length === 0 && (empty || <EmptyState title="No records" text="Nothing to show for the current filters." />)}
    </div>
  );
}
