// Tab memory only: bounded, URL-specific failures never blacklist a place.
const failures = new Map<string, number>();
const TTL = 60_000;
export function hasRecentPhotoFailure(url: string, now = Date.now()): boolean {
  const until = failures.get(url);
  if (until !== undefined && until > now) return true;
  failures.delete(url);
  return false;
}
export function rememberPhotoFailure(url: string, now = Date.now()): void {
  failures.delete(url);
  failures.set(url, now + TTL);
  if (failures.size > 128) failures.delete(failures.keys().next().value!);
}
export function retryPhoto(url: string): void { failures.delete(url); }
