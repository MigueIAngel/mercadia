import { ListSkeleton } from '@/components/ui/Skeletons';

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-3 p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-28" />
          </div>
        ))}
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}
