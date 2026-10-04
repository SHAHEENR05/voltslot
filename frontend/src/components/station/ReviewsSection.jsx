import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Send, AlertCircle, LogIn } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import RatingStars from '../ui/RatingStars.jsx';
import Pagination from '../ui/Pagination.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import { SentimentBar } from './StationHero.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useClock } from '../../lib/clock.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useFetch } from '../../lib/hooks.js';
import { initials, relative } from '../../lib/format.js';

const SENT = { POSITIVE: ['green', 'Positive'], NEUTRAL: ['grey', 'Neutral'], NEGATIVE: ['red', 'Negative'] };
export const SentimentPill = ({ label }) => { const [t, l] = SENT[label] || ['grey', label || '–']; return <span className={`pill ${t}`}>{l}</span>; };

function Histogram({ breakdown, total }) {
  return (
    <div className="col gap-6">
      {[5, 4, 3, 2, 1].map((n) => {
        const c = Number(breakdown?.[n] ?? breakdown?.[String(n)] ?? 0);
        const w = total ? (c / total) * 100 : 0;
        return (
          <div className="sd-hist" key={n}><span className="small muted">{n}★</span><div className="progress amber"><span style={{ width: `${w}%` }} /></div><span className="small muted num">{c}</span></div>
        );
      })}
    </div>
  );
}

/** Write-a-review form. Shows server errors (403 not eligible, 409 already reviewed, field errors). */
export function ReviewForm({ stationId, bookingId, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fe, setFe] = useState({});
  const submit = async (e) => {
    e.preventDefault(); setError(null); setFe({});
    if (!rating) { setFe({ rating: 'Please choose a star rating' }); return; }
    setBusy(true);
    try {
      await api.post(`/stations/${stationId}/reviews`, { rating, comment: comment.trim() || null, bookingId: bookingId || null });
      toast.success('Thanks! Your review is live.');
      setRating(0); setComment(''); onDone?.();
    } catch (err) { setError(err.message); setFe(err.fieldErrors || {}); } finally { setBusy(false); }
  };
  return (
    <form className="sd-review-form" onSubmit={submit} data-testid="review-form">
      <div className="row between wrap gap-8"><b>Write a review</b><span className="xs muted">Only drivers who have charged here can review</span></div>
      <Field label="Your rating" error={fe.rating}><RatingStars value={rating} size={26} showValue={false} onChange={setRating} /></Field>
      <Field label="Comment (optional)" error={fe.comment} hint={`${comment.length}/500`}>
        <textarea className="textarea" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Charger speed, queue, cleanliness, amenities…" aria-label="Comment" />
      </Field>
      {error && <div className="form-error-banner" role="alert" data-testid="review-error"><AlertCircle size={15} style={{ flex: 'none', marginTop: 1 }} />{error}</div>}
      <div className="row"><Button type="submit" variant="primary" icon={<Send size={15} />} loading={busy}>Post review</Button></div>
    </form>
  );
}

/** Rating summary + paged review list + review form. */
export default function ReviewsSection({ stationId, detail, onChanged }) {
  const { isAuthed } = useAuth();
  const { now } = useClock();
  const loc = useLocation();
  const [page, setPage] = useState(0);
  const size = 5;
  const { data, loading, error, reload } = useFetch(`/stations/${stationId}/reviews`, { params: { page, size } });
  const s = detail.summary;
  return (
    <div className="sd-reviews" id="reviews">
      <div className="sd-rev-top">
        <div className="sd-rev-score">
          <div className="sd-rev-big">{Number(s.avgRating).toFixed(1)}</div>
          <RatingStars value={s.avgRating} size={16} showValue={false} />
          <div className="muted small mt-4">{s.reviewCount} reviews</div>
        </div>
        <Histogram breakdown={detail.ratingBreakdown} total={Object.values(detail.ratingBreakdown || {}).reduce((a, b) => a + Number(b), 0)} />
        <div><span className="label">Driver sentiment</span><div className="mt-8"><SentimentBar split={detail.sentiment} /></div></div>
      </div>

      <div className="mt-16">
        {loading && !data ? <div className="col gap-12"><Skeleton h={64} r={12} /><Skeleton h={64} r={12} /></div>
          : error ? <ErrorState error={error} onRetry={reload} title="Could not load reviews" />
          : !data?.content?.length ? <EmptyState icon={<MessageSquare size={24} />} title="No reviews yet" text="Be the first to share your experience after charging here." />
          : (
            <div className="col gap-10 stagger" data-testid="review-list">
              {data.content.map((r) => (
                <article className="sd-review" key={r.id}>
                  <span className="avatar">{initials(r.userName)}</span>
                  <div className="grow">
                    <div className="row between wrap gap-8"><div className="row gap-8"><b>{r.userName}</b><SentimentPill label={r.sentimentLabel} /></div><span className="xs muted">{relative(r.createdAt, now)}</span></div>
                    <RatingStars value={r.rating} size={13} showValue={false} />
                    {r.comment && <p className="mt-4" style={{ color: '#c4d0ea' }}>{r.comment}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        {data && data.totalPages > 1 && <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} size={size} onChange={setPage} />}
      </div>

      <div className="divider" />
      {isAuthed
        ? <ReviewForm stationId={stationId} onDone={() => { setPage(0); reload(); onChanged?.(); }} />
        : <div className="row between wrap gap-8"><span className="muted">Sign in to share your experience.</span><Link className="btn ghost sm" to="/login" state={{ from: loc }}><LogIn size={14} />Sign in</Link></div>}
    </div>
  );
}
