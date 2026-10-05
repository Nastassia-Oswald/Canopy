import { createPortal } from 'react-dom';
// UI primitives. Screens import ONLY from '../ui', so you can replace this file
// with wrappers around your own component library without touching the screens.
// Keep the prop names below and the rest of the app keeps working.

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  full?: boolean;
  type?: 'button' | 'submit';
  small?: boolean;
}) {
  const { variant = 'secondary' } = props;
  return (
    <button
      type={props.type || 'button'}
      className={`btn btn-${variant}${props.full ? ' btn-full' : ''}${props.small ? ' btn-small' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icon && <Icon name={props.icon} size={18} />}
      <span>{props.children}</span>
    </button>
  );
}

export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  size?: 'm' | 'l' | 'xl';
  variant?: 'plain' | 'filled';
  badge?: string;
}) {
  const px = props.size === 'xl' ? 36 : props.size === 'l' ? 28 : 22;
  return (
    <button
      type="button"
      className={`iconbtn iconbtn-${props.size || 'm'} iconbtn-${props.variant || 'plain'}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
      aria-label={props.label}
      title={props.label}
    >
      <Icon name={props.icon} size={px} />
      {props.badge && <span className="iconbtn-badge">{props.badge}</span>}
    </button>
  );
}

export function Chip(props: { children: ReactNode; selected?: boolean; onClick?: () => void; count?: number }) {
  return (
    <button type="button" className={`chip${props.selected ? ' chip-on' : ''}`} onClick={props.onClick} aria-pressed={props.selected}>
      {props.children}
      {props.count != null && <span className="chip-count">{props.count}</span>}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="chiprow">{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'patreon' | 'accent' | 'success' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Without an image, artwork shows the initial on lilac, Fog, metal or grey (picked from the name, so it stays the same). */
const TONES = ['lilac', 'fog', 'metal', ''];
function toneFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function Artwork({ src, alt, size = 56 }: { src?: string; alt: string; size?: number | '100%' }) {
  const style = size === '100%' ? { width: '100%' } : { width: size, height: size };
  const tone = src ? '' : toneFor(alt);
  return (
    <div className={`art${tone ? ' art-' + tone : ''}`} style={style}>
      {src ? <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt.slice(0, 1)}</span>}
    </div>
  );
}

export function ListRow(props: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  dim?: boolean;
  /** finished: desaturated, with the lime check */
  done?: boolean;
}) {
  const Tag = props.onClick ? 'button' : 'div';
  return (
    <div className={`row${props.dim ? ' row-dim' : ''}${props.done ? ' row-done' : ''}`}>
      <Tag className="row-main" onClick={props.onClick} {...(props.onClick ? { type: 'button' } : {})}>
        {props.leading && <div className="row-lead">{props.leading}</div>}
        <div className="row-text">
          <div className="row-title">{props.title}</div>
          {props.subtitle && <div className="row-sub">{props.subtitle}</div>}
          {props.meta && <div className="row-meta">{props.meta}</div>}
        </div>
      </Tag>
      {props.trailing && <div className="row-trail">{props.trailing}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || action) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function TextField(props: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'url' | 'search' | 'number';
  hint?: ReactNode;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="field" htmlFor={props.id}>
      {props.label && <span className="field-label">{props.label}</span>}
      <input
        id={props.id}
        className="field-input"
        type={props.type || 'text'}
        value={props.value}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && props.onEnter?.()}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === props.value}
          className={`seg-btn${o.value === props.value ? ' seg-on' : ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="pbar" aria-hidden="true">
      <div className="pbar-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Toggle(props: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={props.id}>
      <span>{props.label}</span>
      <input id={props.id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Sheet(props: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tall?: boolean; titleClass?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open]);
  if (!props.open) return null;
  // Drawn at the top of the page, so the player and bottom bar can never cover it.
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div
        className={`sheet${props.tall ? ' sheet-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {props.title && (
          <div className="sheet-head">
            <h2 className={props.titleClass}>{props.title}</h2>
            <IconButton icon="close" label="Close" onClick={props.onClose} />
          </div>
        )}
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>
  , document.body);
}

export function MenuItem(props: { icon?: IconName; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`menuitem${props.danger ? ' menuitem-danger' : ''}`} onClick={props.onClick}>
      {props.icon && <Icon name={props.icon} size={20} />}
      <span>{props.children}</span>
    </button>
  );
}

/** Floating confirmations are success messages (green); problems show in the alert red. */
export function Toast({ message, tone = 'success' }: { message: string | null; tone?: 'success' | 'error' }) {
  return (
    <div className={`toast${message ? ' toast-on' : ''} toast-${tone}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}
