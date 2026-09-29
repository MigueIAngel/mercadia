/** Placeholders shown while a page streams in (the loading.tsx files). */

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton mt-3 h-5 w-1/2" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card flex items-center gap-4 p-5">
          <div className="skeleton h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          <div className="skeleton hidden h-8 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

export function PageTitleSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-10 w-64" />
      <div className="skeleton h-4 w-40" />
    </div>
  );
}
