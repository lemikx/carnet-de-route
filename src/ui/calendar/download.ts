export function calendarFeedUrl(supabaseUrl: string, token: string): string {
  const host = new URL(supabaseUrl).host;
  return `webcal://${host}/functions/v1/calendar?token=${token}`;
}

export function calendarHttpsUrl(supabaseUrl: string, token: string): string {
  return calendarFeedUrl(supabaseUrl, token).replace(/^webcal:/, 'https:');
}

export function icsFilename(name: string): string {
  const clean = name
    .replace(/[^\p{L}\p{N} ._-]+/gu, '-')
    .replace(/\s*-[\s-]*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
  return `${clean || 'voyage'}.ics`;
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
