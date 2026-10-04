import { useEffect, useRef, useState } from 'react';
import { Sparkles, IndianRupee, Flame, MapPin, TrendingUp, CloudRain, CalendarCheck, Gauge, PieChart, Filter, MessageSquare, SlidersHorizontal, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { Button } from '../ui';
import { C, Panel, Async, useData, useInView, pretty } from './shared.jsx';

const META = {
  REVENUE: [IndianRupee, C.green], DEMAND: [Flame, C.pink], ZONE: [MapPin, C.cyan], GROWTH: [TrendingUp, C.green], WEATHER: [CloudRain, C.blue],
  BOOKING: [CalendarCheck, C.amber], UTILISATION: [Gauge, C.violet], MIX: [PieChart, C.violet], FUNNEL: [Filter, C.pink], SENTIMENT: [MessageSquare, C.green], FILTER: [SlidersHorizontal, C.cyan],
};
const NUM = /(₹[\d,]+(?:\.\d+)?|[+−-]?\d[\d,]*(?:\.\d+)?%|\b\d{1,2}:00(?:-\d{1,2}:00)?)/g;
const emph = (text, color) => text.split(NUM).map((p, i) => (i % 2 ? <b key={i} style={{ color }}>{p}</b> : p));

export default function InsightCards({ params }) {
  const [ref, seen] = useInView('0px');
  const st = useData('insights', params, seen);
  const rail = useRef(null);
  const [paused, setPaused] = useState(false);
  const step = (dir) => { const el = rail.current; if (el) el.scrollBy({ left: dir * 332, behavior: 'smooth' }); };

  useEffect(() => {
    if (paused || !st.data?.length || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => {
      const el = rail.current; if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) el.scrollTo({ left: 0, behavior: 'smooth' }); else el.scrollBy({ left: 332, behavior: 'smooth' });
    }, 4800);
    return () => clearInterval(t);
  }, [paused, st.data]);

  return (
    <Panel ref={ref} id="insights" icon={<Sparkles size={17} />} color={C.amber} span="s-12" title="Auto-generated insights"
      subtitle="Plain-English findings the rules engine spotted in the filtered data"
      info="Generated server-side from the same aggregates as the charts below (rule based – no external AI call). They update with every filter change."
      actions={<div className="row gap-4"><Button size="sm" variant="ghost" iconOnly aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={16} /></Button><Button size="sm" variant="ghost" iconOnly aria-label="Next" onClick={() => step(1)}><ChevronRight size={16} /></Button></div>}>
      <Async state={st} h={150} isEmpty={(d) => !d.length}>
        {(list) => (
          <div className="ins-rail" ref={rail} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
            {list.map((it, i) => {
              const [Icon, color] = META[it.category] || [Lightbulb, C.cyan];
              return (
                <article key={`${it.category}${i}`} className="ins-insight" style={{ '--c': color, animationDelay: `${i * 60}ms` }} tabIndex={0}>
                  <div className="row gap-8"><span className="ins-insight-ico"><Icon size={16} /></span><span className="ins-insight-cat">{pretty(it.category)}</span><span className="ins-insight-n">{String(i + 1).padStart(2, '0')}</span></div>
                  <p>{emph(it.text, color)}</p>
                </article>
              );
            })}
          </div>
        )}
      </Async>
    </Panel>
  );
}
