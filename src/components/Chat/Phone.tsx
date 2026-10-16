import type { ReactNode } from 'react';
import { actorKeyOf } from '../../lib/actors';
import { useSim } from '../../store';
import styles from './Chat.module.css';

interface Props {
  /** A = sender, B = receiver: tags the phone and lights it up while that side is acting. */
  side: 'A' | 'B';
  role: string;
  city: string;
  contact: { initials: string; name: string };
  children: ReactNode;
  footer: ReactNode;
  align?: 'start' | 'end';
}

export function Phone({ side, role, city, contact, children, footer, align = 'start' }: Props) {
  const active = useSim((s) => actorKeyOf(s) === side);
  return (
    <section aria-label={`Telefone: ${role}`} className={styles.column}>
      <div className={styles.caption} style={{ textAlign: align === 'end' ? 'right' : 'left' }}>
        <span>{role}</span>
        <span>{city}</span>
      </div>
      <div className={styles.phone} data-active={active}>
        <header className={styles.header}>
          <span className={`${styles.side} ${side === 'A' ? styles.sideA : styles.sideB}`} title={side === 'A' ? 'A · remetente' : 'B · destinatário'}>{side}</span>
          <div className={styles.avatar} aria-hidden="true">{contact.initials}</div>
          <div>
            <div className={styles.name}>{contact.name}</div>
            <div className={styles.presence}>online</div>
          </div>
        </header>
        <div className={styles.thread}>{children}</div>
        <footer className={styles.footer}>{footer}</footer>
      </div>
    </section>
  );
}
