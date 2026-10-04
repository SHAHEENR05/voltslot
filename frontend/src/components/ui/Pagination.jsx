import { ChevronLeft, ChevronRight } from 'lucide-react';

/** 0-based pages from the API envelope. <Pagination page totalPages totalElements size onChange /> */
export default function Pagination({ page = 0, totalPages = 1, totalElements, size, onChange }) {
  if (totalPages <= 1 && !totalElements) return null;
  const from = totalElements !== undefined && size ? page * size + 1 : null;
  const to = totalElements !== undefined && size ? Math.min(totalElements, (page + 1) * size) : null;
  return (
    <div className="row between mt-12">
      <span className="muted small">{from !== null ? (totalElements ? `${from}–${to} of ${totalElements}` : '0 results') : `Page ${page + 1} of ${totalPages}`}</span>
      <div className="row gap-6">
        <button className="btn ghost icon sm" disabled={page <= 0} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="small muted">{page + 1} / {Math.max(1, totalPages)}</span>
        <button className="btn ghost icon sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
