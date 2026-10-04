/** <Card title subtitle actions hover clickable selected pad="0|lg" className> */
export default function Card({ title, subtitle, icon, actions, hover, clickable, selected, flat, hero, pad, className = '', children, ...rest }) {
  const cls = ['card', hover && 'hoverable', clickable && 'clickable hoverable', selected && 'selected', flat && 'flat', hero && 'hero', pad && `pad-${pad}`, className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            <div className="card-title">{icon}{title}</div>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="row gap-8">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
