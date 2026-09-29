import { ProductGridSkeleton } from '@/components/ui/Skeletons';

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[16rem_1fr]" aria-busy>
      <aside className="hidden space-y-4 lg:block">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-9" />
        ))}
      </aside>
      <div className="space-y-6">
        <div className="skeleton h-8 w-72" />
        <ProductGridSkeleton count={9} />
      </div>
    </div>
  );
}
