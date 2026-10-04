import { Pencil, Trash2, PlugZap, MapPin } from 'lucide-react';
import { Button, Table, Badge, CrowdingPill, RatingStars, Tooltip } from '../ui';

const hours = (s) => (s.openHour === 0 && s.closeHour === 24 ? '24 × 7' : `${String(s.openHour).padStart(2, '0')}:00 – ${String(s.closeHour % 24).padStart(2, '0')}:00`);

export default function StationsTable({ stations, loading, selectedId, onPoints, onEdit, onDelete, onRowClick }) {
  const columns = [
    { key: 'name', header: 'Station', sortable: true, render: (s) => <div><div className="bold">{s.name}</div><div className="muted xs row gap-4"><MapPin size={11} />{s.zone}, {s.city}</div></div> },
    { key: 'tier', header: 'Tier', sortable: true, render: (s) => <Badge tone={s.tier === 'HUB' ? 'hub' : ''}>{s.tier === 'HUB' ? 'Hub' : 'Standard'}</Badge> },
    { key: 'hours', header: 'Open hours', render: (s) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{hours(s)}</span> },
    { key: 'connectors', header: 'Connectors', render: (s) => <div className="row wrap gap-4">{s.connectors.map((c) => <Tooltip key={c.code} text={`${c.count} × ${c.code}, up to ${c.maxKw} kW`}><span className="badge">{c.code} ×{c.count}</span></Tooltip>)}</div> },
    { key: 'totalPoints', header: 'Points (active / total)', numeric: true, sortable: true, render: (s) => <span><b>{s.activePoints}</b><span className="muted"> / {s.totalPoints}</span></span> },
    { key: 'avgRating', header: 'Rating', numeric: true, sortable: true, render: (s) => (s.reviewCount ? <span className="bold" style={{ whiteSpace: 'nowrap' }}><span className="text-amber">★</span> {s.avgRating.toFixed(1)}</span> : <span className="muted">–</span>) },
    { key: 'crowdingIndexNow', header: 'Crowding now', sortable: true, render: (s) => <CrowdingPill level={s.crowdingLevelNow} index={s.crowdingIndexNow} short /> },
    { key: 'actions', header: 'Actions', render: (s) => (
      <div className="row gap-4" style={{ justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant={selectedId === s.id ? 'primary' : 'ghost'} icon={<PlugZap size={14} />} onClick={() => onPoints(s)}>Points</Button>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${s.name}`} onClick={() => onEdit(s)}><Pencil size={14} /></Button>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${s.name}`} onClick={() => onDelete(s)}><Trash2 size={14} className="text-red" /></Button>
      </div>) },
  ];
  return <Table columns={columns} rows={stations || []} loading={loading} onRowClick={onRowClick} />;
}
