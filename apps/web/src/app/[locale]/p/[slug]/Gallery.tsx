'use client';

import Image from 'next/image';
import { useState } from 'react';

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  return (
    <div className="space-y-3">
      <div className="card relative aspect-square overflow-hidden bg-stone-50">
        {images[active] && (
          <Image
            src={images[active]}
            alt={title}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8"
          />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${title} ${i + 1}`}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white ring-2 ${i === active ? 'ring-ink' : 'ring-stone-200'}`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-contain p-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
