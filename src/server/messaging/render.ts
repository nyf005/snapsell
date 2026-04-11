export function appendBranding(body: string, showBranding: boolean): string {
  if (!showBranding) return body;
  return `${body}\n\n_Via SnapSell_`;
}
