import { forwardRef } from 'react';

/** <Button variant="primary|ghost|danger|success|link" size="sm|lg" icon={<Icon/>} loading block iconOnly> */
const Button = forwardRef(function Button({ variant, size, icon, loading, block, iconOnly, className = '', children, disabled, type = 'button', ...rest }, ref) {
  const cls = ['btn', variant, size, block && 'block', iconOnly && 'icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon}
      {children}
    </button>
  );
});
export default Button;
