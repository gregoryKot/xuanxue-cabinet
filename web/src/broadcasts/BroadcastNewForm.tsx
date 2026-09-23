// Страница «Новая рассылка» — адрес, а не лист поверх журнала (макет
// Form.dc.html, ADR-0033). Сверху вниз: возврат к журналу, рубрика с
// заголовком, поля разовой рассылки с предпросмотром, отправка.
//
// Правки у страницы нет: созданную рассылку API не меняет и не удаляет
// (BroadcastsController) — ушедшую отменяют из журнала, поэтому здесь ни
// строки статуса, ни удаления.
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormDraftNote } from '../components/FormDraftNote';
import { FormServerError } from '../components/FormServerError';
import { noteStyle, screenTitleStyle } from '../components/screenLayout';
import {
  backLinkStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
} from '../components/editorLayout';
import { BroadcastFormFields } from './BroadcastFormFields';
import { useBroadcastCreate } from './useBroadcastCreate';
import { useBroadcastForm } from './useBroadcastForm';

const BROADCASTS_PATH = '/broadcasts';
const BACK_TEXT = 'К журналу рассылок';
const TITLE = 'Новая рассылка';
const EXPLANATION =
  'Текст уйдёт в выбранные каналы как есть: подстановки шаблонов к разовой рассылке **не применяются**.';

interface BroadcastNewFormProps {
  channels: ChannelDto[];
}

export function BroadcastNewForm({ channels }: BroadcastNewFormProps) {
  const navigate = useNavigate();
  const create = useBroadcastCreate();
  const form = useBroadcastForm(create);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // `void` у navigate — он возвращает промис (react-router 7), а здесь
    // результат никому не нужен.
    if (await form.submit()) void navigate(BROADCASTS_PATH);
  }

  return (
    <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
      <Link to={BROADCASTS_PATH} style={backLinkStyle}>
        {BACK_TEXT}
      </Link>

      <div style={editorHeadingStyle}>
        <span className="xuanxue-eyebrow">Рассылка</span>
        <h1 style={screenTitleStyle}>{TITLE}</h1>
        <p style={noteStyle}>{EXPLANATION}</p>
      </div>

      <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />

      <BroadcastFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        channels={channels}
      />

      <FormServerError error={form.serverError} />

      <div style={editorSectionStyle}>
        <Button type="submit" pending={form.pending}>
          Отправить
        </Button>
      </div>
    </form>
  );
}
