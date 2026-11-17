import { describe, expect, it } from 'vitest';
import { deviceLevel, isSoundSetting, nextSetting, SOUND_SETTINGS } from '../../src/client/volume';
import { SOFTEN, VOLUME } from '../../src/client/sound/preset';

describe('livelli del suono', () => {
  it('nextSetting cycles downwards', () => {
    expect(nextSetting('alto')).toBe('medio');
    expect(nextSetting('medio')).toBe('basso');
    expect(nextSetting('basso')).toBe('spento');
    expect(nextSetting('spento')).toBe('alto');
  });

  it('SOUND_SETTINGS segue l\'ordine del ciclo', () => {
    expect(SOUND_SETTINGS).toEqual(['alto', 'medio', 'basso', 'spento']);
  });

  it('deviceLevel', () => {
    expect(deviceLevel(true)).toBe('basso');
    expect(deviceLevel(false)).toBe('medio');
  });

  it('isSoundSetting', () => {
    for (const v of ['alto', 'medio', 'basso', 'spento']) expect(isSoundSetting(v)).toBe(true);
    for (const v of ['acceso', 'boh', null]) expect(isSoundSetting(v)).toBe(false);
  });

  it('VOLUME and SOFTEN have the chosen values', () => {
    expect(VOLUME).toEqual({ alto: 0.5, medio: 0.18, basso: 0.063 });
    expect(SOFTEN).toEqual({ hz: 3500, db: -8 });
  });
});
