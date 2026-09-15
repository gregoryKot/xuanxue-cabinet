// Число «По ссылке пришли» на «Людях» (ADR-0030, CLAUDE.md «Продуктовая
// фича = число в своём разделе»): чистый форматтер, честное «пока никто» на
// пустой базе, а не «0» голым числом (docs/adr/0025).
export function formatJoinedViaInviteCount(count: number): string {
  if (count === 0) return 'По ссылке пока никто не пришёл';
  return `По ссылке пришли: ${count}`;
}
