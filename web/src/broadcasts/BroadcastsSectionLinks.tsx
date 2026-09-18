// Переходы в подэкраны «Рассылок» — «Каналы» и «Шаблоны постов». Вынесены из
// BroadcastsScreen.tsx: тот упёрся в 150 строк храповика размера, а правило
// прямо просит дробить файл, а не пухнуть дальше (CLAUDE.md «Храповики»).
// Заодно тексты подсказок уехали туда же, где ими пользуются.
//
// Два перехода стоят рядом, а не друг под другом: так в макете 2a, и та же
// сетка держит блоки «Экзаменов» из 2b — один приём на оба экрана, поэтому
// класс общий (.xuanxue-block-grid, docs/adr/0043).
import { SectionLink } from '../components/SectionLink';

const CHANNELS_LINK_HINT =
  'Куда уходят посты. Telegram-группа подключается сама, когда в неё добавили бота.';
const TEMPLATES_LINK_HINT = 'Тексты, которыми бот пишет в канал, и адрес сайта школы.';

export function BroadcastsSectionLinks() {
  return (
    <div className="xuanxue-block-grid">
      <SectionLink to="/channels" title="Каналы" hint={CHANNELS_LINK_HINT} />
      <SectionLink to="/templates" title="Шаблоны постов" hint={TEMPLATES_LINK_HINT} />
    </div>
  );
}
