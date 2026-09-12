// «Настройки» — одна страница для всего, что учитель трогает редко: слоты
// расписания, каналы, шаблоны постов, журнал рассылок, люди. Раньше каждое из
// этого занимало свою вкладку наравне с ежедневным (отзыв владельца
// 2026-09-11: «это кабинет учителя, там разово всё настроить и забыть; зачем
// все эти вкладки»). Экраны остались прежними — сюда переехал только вход в
// них.
//
// «Выйти» тоже здесь, а не в шапке: в шапке кнопка висела на каждом экране,
// хотя нужна раз в жизни (отзыв владельца 2026-09-12).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { LogoutButton } from '../auth/LogoutButton';
import {
  BroadcastsIcon,
  ChannelsIcon,
  ExamItemsIcon,
  PeopleIcon,
  ScheduleIcon,
  TemplatesIcon,
} from '../app/navIcons';
import { screenSectionStyle } from '../components/screenLayout';
import { SETTINGS_LINKS, type SettingsLink } from './settingsLinks';

const ICONS = {
  schedule: ScheduleIcon,
  channels: ChannelsIcon,
  templates: TemplatesIcon,
  broadcasts: BroadcastsIcon,
  people: PeopleIcon,
  examItems: ExamItemsIcon,
} as const;

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

const cardStyle: CSSProperties = {
  display: 'flex',
  // Иконка ровняется по первой строке, а не по середине карточки: подсказка
  // бывает в три строки, и по центру иконка повисает напротив пустоты.
  alignItems: 'flex-start',
  gap: 12,
  padding: 16,
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--ink)',
  textDecoration: 'none',
};

const iconStyle: CSSProperties = {
  display: 'flex',
  marginTop: 2,
  color: 'var(--ink-soft)',
};
const titleStyle: CSSProperties = { display: 'block', fontWeight: 600 };
const hintStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)', fontSize: 14 };
// Подсказка внутри ссылки — span, не p: абзацу не место внутри строчного
// содержимого ссылки, браузер такую вложенность разбирает по-своему.
const cardHintStyle: CSSProperties = { ...hintStyle, display: 'block' };

function SettingsCard({ link }: { link: SettingsLink }) {
  const Icon = ICONS[link.icon];
  return (
    <Link to={link.to} style={cardStyle}>
      <span style={iconStyle}>
        <Icon />
      </span>
      <span>
        <span style={titleStyle}>{link.title}</span>
        <span style={cardHintStyle}>{link.hint}</span>
      </span>
    </Link>
  );
}

export default function SettingsScreen() {
  const { me } = useAuth();
  const isAdmin = hasRole(me, 'admin');

  return (
    <main style={screenSectionStyle}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Настройки</h1>
      <p style={hintStyle}>Всё это настраивается один раз и дальше работает само.</p>

      <div style={listStyle}>
        {SETTINGS_LINKS.filter((link) => !link.adminOnly || isAdmin).map((link) => (
          <SettingsCard key={link.to} link={link} />
        ))}
      </div>

      <LogoutButton />
    </main>
  );
}
