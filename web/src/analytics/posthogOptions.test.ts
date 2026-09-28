import { describe, expect, it } from 'vitest';
import { POSTHOG_HOST } from '@xuanxue/shared';
import { buildPosthogOptions } from './posthogOptions';

describe('buildPosthogOptions', () => {
  it('хост — облако ЕС, без свойств кроме identified_only', () => {
    const options = buildPosthogOptions();
    expect(options.api_host).toBe(POSTHOG_HOST);
    expect(options.person_profiles).toBe('identified_only');
  });

  it('ошибки браузера не дублирует свой механизм (ADR-0071)', () => {
    expect(buildPosthogOptions().capture_exceptions).toBe(false);
  });

  it('скрипты только внешним импортом — не догружаются с чужого домена', () => {
    expect(buildPosthogOptions().disable_external_dependency_loading).toBe(true);
  });

  it('весь текст и ввод маскируются — autocapture и запись сессии', () => {
    const options = buildPosthogOptions();
    expect(options.mask_all_text).toBe(true);
    expect(options.mask_all_element_attributes).toBe(true);
    expect(options.session_recording?.maskAllInputs).toBe(true);
    expect(options.session_recording?.maskTextSelector).toBe('*');
  });

  it('картинки, видео и iframe не записываются вовсе', () => {
    expect(buildPosthogOptions().session_recording?.blockSelector).toBe(
      'img, video, iframe, canvas',
    );
  });

  it('запись не стартует сама при init — сначала проверка пути', () => {
    expect(buildPosthogOptions().disable_session_recording).toBe(true);
  });

  it('before_send задан — через него проходят URL-поля перед отправкой', () => {
    expect(typeof buildPosthogOptions().before_send).toBe('function');
  });
});
