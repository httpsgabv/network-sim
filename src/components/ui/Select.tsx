import * as RadixSelect from '@radix-ui/react-select';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Select.module.css';

// Same API as shadcn/ui's select.tsx, styled with our tokens in a CSS Module (no Tailwind).
export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;

export function SelectTrigger({ children, className, ...props }: ComponentProps<typeof RadixSelect.Trigger>) {
  return (
    <RadixSelect.Trigger className={className ? `${styles.trigger} ${className}` : styles.trigger} {...props}>
      {children}
      <RadixSelect.Icon asChild>
        <svg className={styles.chevron} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
}

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    // Portal: the cockpit has overflow hidden, an inline list would be clipped.
    <RadixSelect.Portal>
      <RadixSelect.Content className={styles.content} position="popper" sideOffset={6}>
        <RadixSelect.Viewport className={styles.viewport}>{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
}

export function SelectItem({ children, ...props }: ComponentProps<typeof RadixSelect.Item>) {
  return (
    <RadixSelect.Item className={styles.item} {...props}>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className={styles.check}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
