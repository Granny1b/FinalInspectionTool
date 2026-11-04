import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { StateCard } from './StateCard';

type Props = {
  icon: LucideIcon;
  title: string;
  /** One line telling the user what will appear here, or what to do. */
  hint: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, hint, action }: Props) {
  return <StateCard icon={icon} tone="brand" title={title} hint={hint} action={action} />;
}
