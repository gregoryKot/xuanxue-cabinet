// Подпись файла в отчётах гейтов и ключ в бейслайнах — всегда с `/`. Бейслайны и
// allowlist-ы закоммичены с прямыми слэшами, а `path.relative` на Windows отдаёт
// `web\src\x.ts`: файл не находился в списке, и гейт краснел на каждой строке
// (инцидент 2026-10-14). Метка из `relative(ROOT, …)` в скриптах запрещена гейтом
// `windows-portability.test.mjs`.
import { relative, sep } from 'path';

export function repoPath(root, absPath) {
  return relative(root, absPath).split(sep).join('/');
}
