export default function Loading() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-10 lg:grid-cols-[1fr_20rem]" aria-busy>
      <div className="card space-y-4 p-8">
        <div className="skeleton h-8 w-60" />
        <div className="skeleton h-20" />
        <div className="skeleton h-20" />
        <div className="skeleton h-12 rounded-full" />
      </div>
      <div className="card space-y-3 p-6">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-40" />
      </div>
    </div>
  );
}
