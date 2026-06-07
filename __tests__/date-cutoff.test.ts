import { threeMonthsAgoUtc } from '@/utils/date';

describe('threeMonthsAgoUtc', () => {
  it('returns the timestamp three calendar months earlier in UTC', () => {
    const now = new Date('2026-06-07T12:30:45Z');
    expect(threeMonthsAgoUtc(now)).toBe('2026-03-07 12:30:45');
  });

  it('rolls back across a year boundary', () => {
    const now = new Date('2026-01-15T08:00:00Z');
    expect(threeMonthsAgoUtc(now)).toBe('2025-10-15 08:00:00');
  });

  it('formats like SQLite created_at (space separator, no T or Z)', () => {
    const result = threeMonthsAgoUtc(new Date('2026-06-07T12:30:45Z'));
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
