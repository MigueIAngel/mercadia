import { notFound } from 'next/navigation';

/** Unknown paths render the localized 404 inside the site layout. */
export default function CatchAll() {
  notFound();
}
