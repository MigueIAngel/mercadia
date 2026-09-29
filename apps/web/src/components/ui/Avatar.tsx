import clsx from 'clsx';

const PALETTE = ['#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899', '#eab308', '#14b8a6'];

/** Cloudinary serves a face-centred square of the right size; other URLs pass through. */
export function avatarSrc(url: string, size: number) {
  return url.includes('res.cloudinary.com/') && url.includes('/image/upload/')
    ? url.replace(
        '/image/upload/',
        `/image/upload/c_fill,g_face,w_${size * 2},h_${size * 2},q_auto,f_auto/`,
      )
    : url;
}

function colorOf(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Profile photo, or the initials on a colour derived from the name. */
export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc(src, size)}
        alt={name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={clsx('shrink-0 rounded-full object-cover ring-2 ring-white', className)}
        style={style}
      />
    );
  return (
    <span
      aria-hidden
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white',
        className,
      )}
      style={{ ...style, background: colorOf(name) }}
    >
      {initials || '?'}
    </span>
  );
}
