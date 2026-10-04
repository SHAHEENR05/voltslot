/** <Badge tone="primary|green|amber|red|violet|pink|hub">text</Badge> */
export default function Badge({ tone = '', children, className = '', ...rest }) {
  return <span className={`badge ${tone} ${className}`} {...rest}>{children}</span>;
}
