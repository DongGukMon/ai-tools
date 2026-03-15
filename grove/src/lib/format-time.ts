export function formatCommitTime(unixSeconds: string): string {
  const ts = Number(unixSeconds) * 1000;
  if (Number.isNaN(ts)) return unixSeconds;

  const now = Date.now();
  const diff = now - ts;

  if (diff < 0) return formatDate(ts);

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return formatDate(ts);
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
