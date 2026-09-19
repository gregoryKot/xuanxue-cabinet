// «Проверка» на странице канала — отправить в канал короткое тестовое
// сообщение и показать, чем оно кончилось (POST /channels/:id/test).
// Раньше кнопка стояла в строке списка; строка списка осталась строкой
// (ChannelCard.tsx, ADR-0033), а проверка переехала туда, где у неё есть
// место на объяснение: тест уходит в живой канал, и человек должен понимать
// это до нажатия (CLAUDE.md «Каждая фича объясняет откуда это и зачем»).
import type { CSSProperties } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { editorSectionStyle } from '../components/editorLayout';
import { formatChannelTestResult } from './formatChannelTestResult';
import { useChannelTest } from './useChannelTest';

const EXPLANATION =
  'Бот отправит в канал короткое сообщение — так видно, что доступ на месте и пост дойдёт.';

const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 10,
};
const explanationStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const failedStyle: CSSProperties = { ...explanationStyle, color: 'var(--danger)' };

interface ChannelTestSectionProps {
  channel: ChannelDto;
}

export function ChannelTestSection({ channel }: ChannelTestSectionProps) {
  const test = useChannelTest(channel.id, channel.updatedAt);
  const failed = test.result?.status === 'failed';

  return (
    <div style={sectionStyle}>
      <span className="xuanxue-eyebrow">Проверка</span>
      <p style={explanationStyle}>{EXPLANATION}</p>

      <Button
        type="button"
        variant="secondary"
        pending={test.pending}
        onClick={() => void test.test()}
      >
        Отправить тест
      </Button>

      {test.result && (
        <p
          style={failed ? failedStyle : explanationStyle}
          role={failed ? 'alert' : 'status'}
        >
          {formatChannelTestResult(test.result)}
        </p>
      )}
      {test.error && (
        <p style={failedStyle} role="alert">
          {test.error}
        </p>
      )}
    </div>
  );
}
