// Страница занятия расписания — адрес, а не лист поверх сетки (ADR-0033,
// образец — exam-items/ExamItemEditorForm.tsx). Сверху вниз: возврат к
// расписанию, рубрика с названием, поля занятия, дни и время, каналы
// рассылки, подвал с сохранением и удалением.
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError } from '../components/FormServerError';
import {
  editorActionsRowStyle,
  editorDangerButtonStyle,
  editorDangerRowStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useTeachers } from '../people/useTeachers';
import { ClassChannelsField } from './ClassChannelsField';
import { ClassFormFields } from './ClassFormFields';
import { RuleFields } from './RuleFields';
import { useClassForm } from './useClassForm';
import type { UseClassEditorResult } from './useClassEditor';

const SCHEDULE_PATH = '/schedule';
const BACK_TEXT = 'К расписанию';
const EYEBROW = 'Расписание';
const NEW_CLASS_TITLE = 'Новое занятие в расписании';
const REMOVE_LABEL = 'Удалить из расписания';

interface ClassEditorFormProps {
  /** `null` — `/schedule/new`, занятия ещё нет. */
  classDto: ClassDto | null;
  /** Активные каналы — грузятся страницей до формы (ClassEditorScreen.tsx):
   * новому занятию Telegram-каналы отмечаются заранее (classFormInput.ts). */
  channels: ChannelDto[];
  editor: UseClassEditorResult;
}

export function ClassEditorForm({ classDto, channels, editor }: ClassEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToSchedule = () => void navigate(SCHEDULE_PATH);
  const form = useClassForm(
    classDto,
    channels,
    editor.create,
    editor.update,
    editor.remove,
  );
  const teachersState = useTeachers();
  const noRules = form.state.rules.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goToSchedule();
  }

  async function handleRemove() {
    if (await form.remove()) goToSchedule();
  }

  return (
    <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
      <Link to={SCHEDULE_PATH} style={textLinkStyle}>
        {BACK_TEXT}
      </Link>

      <div style={editorHeadingStyle}>
        <span className="xuanxue-eyebrow">{EYEBROW}</span>
        <h1 style={screenTitleStyle}>{classDto ? classDto.title : NEW_CLASS_TITLE}</h1>
      </div>

      <ClassFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        teachers={teachersState.teachers ?? []}
        teachersError={teachersState.error}
        onRetryTeachers={() => void teachersState.reload()}
      />

      <div style={editorSectionStyle}>
        <RuleFields
          rules={form.state.rules}
          onChange={(rules) => form.setField('rules', rules)}
        />
      </div>

      <div style={editorSectionStyle}>
        <ClassChannelsField
          channels={channels}
          selectedIds={form.state.channelIds}
          onChange={(channelIds) => form.setField('channelIds', channelIds)}
        />
      </div>

      <FormServerError error={form.serverError} />

      <div style={editorSectionStyle}>
        <div style={editorActionsRowStyle}>
          <Button type="submit" pending={form.pending} disabled={noRules}>
            Сохранить
          </Button>
        </div>

        {classDto && (
          <div style={editorDangerRowStyle}>
            <Button
              type="button"
              variant="danger"
              style={editorDangerButtonStyle}
              pending={form.pending}
              onClick={() => void handleRemove()}
            >
              {REMOVE_LABEL}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
