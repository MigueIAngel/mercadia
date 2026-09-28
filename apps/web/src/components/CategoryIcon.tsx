import {
  Bike,
  Dumbbell,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Watch,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  sofa: Sofa,
  sparkles: Sparkles,
  shirt: Shirt,
  watch: Watch,
  'shopping-basket': ShoppingBasket,
  dumbbell: Dumbbell,
  bike: Bike,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? ShoppingBasket;
  return <Icon className={className} aria-hidden />;
}
