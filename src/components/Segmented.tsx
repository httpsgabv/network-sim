import styles from './Segmented.module.css';

interface Props<T> {
  label: string;
  /** `title` is a tooltip for options whose short label needs a longer description. */
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange(value: T): void;
  /** Visible caption inside the track (otherwise label is only for screen readers). */
  caption?: string;
  mono?: boolean;
}

export function Segmented<T extends string | number>({ label, options, value, onChange, caption, mono }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={styles.track}>
      {caption && <span className={styles.caption}>{caption}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          className={mono ? `${styles.item} ${styles.mono}` : styles.item}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
