/**
 * Where to go after signing in. Only local paths are allowed (no open redirects such as
 * `//evil.com` or `https://…`), and the locale prefix is dropped because the router adds it.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !/^\/(?![/\\])/.test(next)) return '/';
  return next.replace(/^\/(es|en)(?=\/|$)/, '') || '/';
}
