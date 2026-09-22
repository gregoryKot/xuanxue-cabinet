// Поля ВК-канала — вынесены из ChannelFormFields.tsx (CLAUDE.md «Файлы»).
// ChannelFormFields.test.tsx и полный ChannelEditorScreen.test.tsx проверяют
// эти поля только с error === null или с ошибкой другого поля («title») —
// сообщение именно у 'token'/'peerIdText' нигде не проверено, хотя обе ветки
// errorFor существуют для этого не просто так (клиентская валидация
// channelFormInput.ts: пустой токен при создании, невалидный ID беседы).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelVkFields } from './ChannelVkFields';
import { initialChannelFormState } from './channelFormInput';

describe('ChannelVkFields', () => {
  it('error.field === "token" — сообщение под полем токена', () => {
    render(
      <ChannelVkFields
        state={initialChannelFormState(null)}
        setField={vi.fn()}
        isCreate
        error={{ field: 'token', message: 'Укажите токен сообщества ВК.' }}
      />,
    );

    expect(screen.getByText('Укажите токен сообщества ВК.')).toBeInTheDocument();
  });

  it('error.field === "peerIdText" — сообщение под полем ID беседы', () => {
    render(
      <ChannelVkFields
        state={initialChannelFormState(null)}
        setField={vi.fn()}
        isCreate={false}
        error={{ field: 'peerIdText', message: 'ID беседы ВК — целое число.' }}
      />,
    );

    expect(screen.getByText('ID беседы ВК — целое число.')).toBeInTheDocument();
  });

  it('ошибка другого поля — у token и peerIdText её не видно', () => {
    render(
      <ChannelVkFields
        state={initialChannelFormState(null)}
        setField={vi.fn()}
        isCreate
        error={{ field: 'title', message: 'Впишите название канала.' }}
      />,
    );

    expect(screen.queryByText('Впишите название канала.')).not.toBeInTheDocument();
  });
});
