import { useEffect, useId, useRef } from 'react';
import {
  NavigationType,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';

/**
 * Регистрирует запись истории через react-router при монтировании
 * fullscreen-листа (CLAUDE.md: любой `position: fixed, inset: 0` — сюда),
 * чтобы кнопка «Назад» в браузере закрывала лист, а не уводила из кабинета.
 *
 * Только `useNavigate`/`useLocation` — прямой `history.pushState` конфликтует
 * с React Router: при «Назад» срабатывают оба обработчика одновременно, и
 * лист закрывается, и роутер уходит на предыдущий раздел.
 *
 * Вложенный лист (например ConfirmDialog поверх ClassSheet) при монтировании
 * тоже пушет запись — это тоже смена `__sheetId` у внешнего листа, но не
 * «назад»: сверяем ещё `useNavigationType()`, закрываем только на POP
 * (реальное «Назад» браузера или чужой `navigate(-1)`), не на PUSH дочернего
 * листа — иначе внешний лист закрывался бы в момент открытия вложенного
 * (ревью п.16).
 *
 * Возвращает `goBack()` — её обязаны вызывать все кнопки «Назад»/«Закрыть»
 * внутри листа, а не `onClose` напрямую.
 *
 * Правило для вложенного диалога (ConfirmDialog поверх ChannelSheet/
 * ClassSheet/LessonSheet): лист закрывается только через собственный
 * goBack() своего экземпляра хука, и не более одного вызова goBack() за раз
 * во всём дереве листов. Если родительский лист должен закрыться КАК
 * СЛЕДСТВИЕ действия во вложенном диалоге (например, лист канала закрывается
 * после успешного удаления через ConfirmDialog) — не вызывайте оба goBack()
 * из одного обработчика: вложенный диалог сам вызовет свой единственный
 * goBack() после ответа сервера, а родитель — свой отдельным эффектом,
 * который сработает уже после того, как вложенный диалог закрылся (ревью
 * п.5, п.18, пример — channels/ChannelSheet.tsx). Два navigate(-1) в одном
 * такте путают историю: непредсказуемо, какая запись на самом деле
 * закрылась.
 */
export function useHistorySheet(onClose: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const ref = useRef(onClose);
  // ref.current читается только из пост-коммит эффекта ниже, обновлять его в
  // рендере не нужно.
  useEffect(() => {
    ref.current = onClose;
  });
  // useId вместо Date.now/Math.random в рендере — стабильный уникальный ID,
  // чтобы вложенные листы не путали свои записи истории.
  const id = useId();
  const ready = useRef(false);

  useEffect(() => {
    const prevState = (location.state as Record<string, unknown> | null) ?? {};
    void navigate(location.pathname + location.search + location.hash, {
      replace: false,
      state: { ...prevState, __sheetId: id },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пушим запись истории только при монтировании, а не на каждое изменение location
  }, []);

  useEffect(() => {
    if (!ready.current) {
      // Ждём, пока наш navigate выше не закоммитится.
      if ((location.state as { __sheetId?: string } | null)?.__sheetId === id)
        ready.current = true;
      return;
    }
    const isOurs = (location.state as { __sheetId?: string } | null)?.__sheetId === id;
    // Нашей записи больше нет в истории, и это POP («Назад», не PUSH
    // вложенного листа поверх нас) — закрываем.
    if (!isOurs && navigationType === NavigationType.Pop) {
      ref.current();
    }
  }, [location, id, navigationType]);

  return () => {
    void navigate(-1);
  };
}
