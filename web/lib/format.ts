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
  return `${Math.round(absMinutes / 60)}h`;
}