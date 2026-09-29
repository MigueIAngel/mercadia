export default function Loading() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-2" aria-busy>
      <div className="space-y-3">
        <div className="skeleton aspect-square rounded-3xl" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-3/4" />
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-12 w-48" />
        <div className="skeleton h-24 w-full" />
        <div className="flex gap-3">
          <div className="skeleton h-12 flex-1 rounded-full" />
          <div className="skeleton h-12 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}
