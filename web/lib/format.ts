export function formatDateTime(value?: string) {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelativeTime(value?: string) {
  if (!value) return "";

  const delta = new Date(value).getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(delta) / 60000);

  if (absMinutes < 1) return "now";
  if (absMinutes < 60) return `${absMinutes}m`;
  const hours = Math.round(absMinutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`;
}

export function formatMatchTiming(value: string, status: string) {
  if (status === "live") return "In progress";
  if (status === "finished") return "Finished";
  const direction = new Date(value).getTime() < Date.now() ? "ago" : "away";
  return `${formatRelativeTime(value)} ${direction}`;
}
