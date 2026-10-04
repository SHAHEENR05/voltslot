import { Radio } from 'lucide-react';
import { Card, CrowdingPill, EmptyState, Skeleton } from '../ui';
import { CROWD } from '../../lib/constants.js';

/** Live station cards: busy / total points as dots, crowding pill, utilisation bar. */
export default function LiveStations({ stations, loading, selectedId, onSelect }) {
  if (loading) return <div className="grid auto">{Array.from({ length: 4 }, (_, i) => <Skeleton.Card key={i} h={70} />)}</div>;
  if (!stations?.length) return <EmptyState title="No stations yet" text="Create your first station to see live status here." />;
  return (
    <div className="grid auto">
      {stations.map((s) => {
        const free = Math.max(0, s.activePoints - s.busyNow);
        const off = s.totalPoints - s.activePoints;
        const util = s.activePoints ? Math.round((s.busyNow / s.activePoints) * 100) : 0;
        const c = CROWD[s.crowdingLevelNow] || CROWD.LOW;
        return (
          <Card key={s.stationId} hover clickable selected={selectedId === s.stationId} onClick={() => onSelect?.(s.stationId)} className="live-card">
            <div className="row between start">
              <div style={{ minWidth: 0 }}>
                <div className="bold truncate" title={s.name}>{s.name}</div>
                <div className="muted xs row gap-4"><Radio size={11} className="text-green" /> live · {s.busyNow}/{s.activePoints} busy</div>
              </div>
              <CrowdingPill level={s.crowdingLevelNow} index={s.crowdingIndexNow} short live />
            </div>
            <div className="point-dots mt-12" aria-label={`${s.busyNow} busy, ${free} free, ${off} unavailable`}>
              {Array.from({ length: s.busyNow }, (_, i) => <i key={`b${i}`} className="pd busy" title="Busy" />)}
              {Array.from({ length: free }, (_, i) => <i key={`f${i}`} className="pd free" title="Free" />)}
              {Array.from({ length: off }, (_, i) => <i key={`o${i}`} className="pd off hatched" title="Maintenance / offline" />)}
            </div>
            <div className="row between mt-8 small">
              <span className="muted">{s.busyNow}/{s.totalPoints} busy · {free} free{off ? ` · ${off} out of service` : ''}</span>
              <span style={{ color: c.color }} className="bold">{util}%</span>
            </div>
            <div className={`progress mt-4 ${s.crowdingLevelNow === 'HIGH' ? 'red' : s.crowdingLevelNow === 'MEDIUM' ? 'amber' : 'green'}`}><span style={{ width: `${Math.max(util, 4)}%` }} /></div>
          </Card>
        );
      })}
    </div>
  );
}
