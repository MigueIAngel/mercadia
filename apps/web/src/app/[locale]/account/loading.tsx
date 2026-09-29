import { PageTitleSkeleton } from '@/components/ui/Skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10" aria-busy>
      <PageTitleSkeleton />
      {[40, 24, 32].map((h) => (
        <div key={h} className="card space-y-4 p-6">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton" style={{ height: `${h * 4}px` }} />
        </div>
      ))}
    </div>
  );
}
