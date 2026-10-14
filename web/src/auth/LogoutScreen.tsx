// Экран `/logout` (ADR-0183): wiki ведёт сюда по ссылке «Выйти». Адрес только
// открывает страницу, выход делает кнопка: ссылка, по которой выходишь от
// одного открытия, срабатывала бы от предзагрузки и чужих вставленных картинок.
// Кнопка показана и гостю — выход на сервере идемпотентен.
import { EntryColumn } from '../components/EntryColumn';
import { screenTitleStyle } from '../components/screenLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LogoutButton } from './LogoutButton';

const PAGE_TITLE = 'Выход';

export default function LogoutScreen() {
  useDocumentTitle(PAGE_TITLE);

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{PAGE_TITLE}</h1>
      <LogoutButton />
    </EntryColumn>
  );
}
