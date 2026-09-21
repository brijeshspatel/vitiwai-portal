import { describe, expect, it } from 'vitest';
import { toCaseStatus } from '@/adapters/odoo/case';

// The six codes are the complete selection list Odoo 19 declares for
// project.task.state, read from the running instance on 2026-09-21.
describe('every project.task.state Odoo declares maps to a portal status', () => {
  it.each([
    ['01_in_progress', 'in_progress'],
    ['02_changes_requested', 'in_progress'],
    ['03_approved', 'in_progress'],
    ['04_waiting_normal', 'waiting'],
    ['1_done', 'resolved'],
    ['1_canceled', 'cancelled'],
  ])('maps %s to %s', (code, expected) => {
    expect(toCaseStatus(code)).toBe(expected);
  });

  it('treats Odoo false as waiting rather than throwing', () => {
    expect(toCaseStatus(false)).toBe('waiting');
  });

  it('claims no progress for a state it does not recognise', () => {
    expect(toCaseStatus('99_invented_later')).toBe('waiting');
  });
});
