import { ListSkeleton, PageTitleSkeleton } from '@/components/ui/Skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10" aria-busy>
      <PageTitleSkeleton />
      <ListSkeleton />
    </div>
  );
}
