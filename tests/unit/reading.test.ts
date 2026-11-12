import { describe, expect, it } from 'vitest';
import { bar, dailyTotals, formatDuration, lastDays, lastWeeks, progressBar } from '../../src/lib/reading';
import { dailyRows, weeklyRows } from '../../src/lib/reading';
import { formatDate, fromDate, localToday } from '../../src/lib/dates';
import type { Book } from '../../src/lib/schema';

const book = (days: { date: string; seconds: number }[]): Book => ({
  id: 'a'.repeat(32), slug: 'x', title: 'X', authors: [], pages: 1, progress: 0.5, status: 'in-corso',
  startedAt: '2026-01-01T10:00:00+01:00', lastReadAt: '2026-01-01T10:00:00+01:00', totalSeconds: 0, days,
});

describe('reading', () => {
  it('progressBar', () => {
    expect(progressBar(0.42, 20)).toBe('████████░░░░░░░░░░░░');
    expect(progressBar(0, 4)).toBe('░░░░');
    expect(progressBar(1, 4)).toBe('████');
  });
  it('dailyTotals somma i libri', () => {
    const t = dailyTotals([book([{ date: '2026-11-10', seconds: 60 }]), book([{ date: '2026-11-10', seconds: 30 }, { date: '2026-11-09', seconds: 5 }])]);
    expect(t.get('2026-11-10')).toBe(90);
    expect(t.get('2026-11-09')).toBe(5);
  });
  it('lastDays riempie con zeri', () => {
    const d = lastDays(new Map([['2026-11-10', 90]]), '2026-11-10', 14);
    expect(d).toHaveLength(14);
    expect(d[13]).toEqual({ date: '2026-11-10', seconds: 90 });
    expect(d[0].date).toBe('2026-10-28');
    expect(d[12].seconds).toBe(0);
  });
  it('lastDays attraversa il cambio d\'anno', () => {
    const d = lastDays(new Map(), '2026-01-02', 4);
    expect(d.map((x) => x.date)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
  it('lastWeeks parte da lunedì', () => {
    const w = lastWeeks(new Map([['2026-11-10', 90], ['2026-11-08', 10]]), '2026-11-10', 12);
    expect(w).toHaveLength(12);
    expect(w[11]).toEqual({ weekStart: '2026-11-09', seconds: 90 });
    expect(w[10]).toEqual({ weekStart: '2026-11-02', seconds: 10 });
    for (const x of w) expect(new Date(x.weekStart + 'T00:00:00Z').getUTCDay()).toBe(1);
  });
  it('bar', () => {
    expect(bar(50, 100, 10)).toBe('█████     ');
    expect(bar(0, 100, 4)).toBe('    ');
    expect(bar(1, 1000, 4)).toBe('█   ');
    expect(bar(5, 0, 4)).toBe('    ');
  });
  it('formatDuration', () => {
    expect(formatDuration(34 * 60)).toBe('34 min');
    expect(formatDuration(3900)).toBe('1 h 05 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
  });
  it('date', () => {
    expect(formatDate('2026-11-02')).toBe('02/11/2026');
    expect(localToday(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });
});

describe('righe del ritmo', () => {
  it('stanno in 34 colonne anche con 99 h 59 min', () => {
    const t = new Map([['2026-11-10', 99 * 3600 + 59 * 60], ['2026-10-20', 60]]);
    for (const r of [...dailyRows(t, '2026-11-10', 14), ...weeklyRows(t, '2026-11-10', 12)]) expect(r.length).toBe(34);
  });
});

describe('fromDate', () => {
  it('elide davanti a 1, 8 e 11', () => {
    expect(fromDate('2026-11-12')).toBe('dal 12/11/2026');
    expect(fromDate('2026-11-11')).toBe("dall'11/11/2026");
    expect(fromDate('2026-03-01')).toBe("dall'01/03/2026");
    expect(fromDate('2026-03-08')).toBe("dall'08/03/2026");
    expect(fromDate('2026-03-18')).toBe('dal 18/03/2026');
  });
});
