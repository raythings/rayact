export function serverIdentityKey(entry: { url: string; appKey?: string }): string {
  const key = entry.appKey?.trim();
  if (key) return `key:${key}`;
  return `url:${entry.url.replace(/\/+$/, '')}`;
}
