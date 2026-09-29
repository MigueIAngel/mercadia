import { PageTitleSkeleton, ProductGridSkeleton } from '@/components/ui/Skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10" aria-busy>
      <PageTitleSkeleton />
      <ProductGridSkeleton />
    </div>
  );
}
