import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DTR_EVENT_LABEL,
  DTR_STATUS_LABEL,
  formatDtrHours,
  formatDtrPeriod,
} from './dtrFormat.ts';

test('formatDtrHours reads as hours and minutes', () => {
  assert.equal(formatDtrHours(0), '0m');
  assert.equal(formatDtrHours(45), '45m');
  assert.equal(formatDtrHours(60), '1h');
  assert.equal(formatDtrHours(485), '8h 5m');
  assert.equal(formatDtrHours(14400), '240h');
  // A negative total is a bug upstream, not something to render.
  assert.equal(formatDtrHours(-30), '0m');
});

test('formatDtrPeriod states the year once when both ends share it', () => {
  assert.equal(formatDtrPeriod('2026-08-04', '2026-09-08'), 'Aug 4 – Sep 8, 2026');
});

test('formatDtrPeriod spells out both years when the period spans a new year', () => {
  assert.equal(formatDtrPeriod('2026-12-01', '2027-01-15'), 'Dec 1, 2026 – Jan 15, 2027');
});

test('formatDtrPeriod parses the day as local, never as UTC', () => {
  // A UTC parse renders August 3 for anyone west of Greenwich, which would
  // silently report the wrong SIL start date.
  assert.ok(formatDtrPeriod('2026-08-04', '2026-08-04').startsWith('Aug 4'));
});

test('formatDtrPeriod copes with a half-open or missing period', () => {
  assert.equal(formatDtrPeriod(null, null), '—');
  assert.equal(formatDtrPeriod('2026-08-04', null), 'Aug 4, 2026');
  assert.equal(formatDtrPeriod(null, '2026-09-08'), 'Sep 8, 2026');
});

test('every DTR status has a label, so none renders as a raw enum', () => {
  assert.equal(DTR_STATUS_LABEL.pending, 'Pending Review');
  assert.equal(DTR_STATUS_LABEL.approved, 'Approved');
  // "Revision Required", not "Rejected": the goal is to correct the DTR.
  assert.equal(DTR_STATUS_LABEL.revision_requested, 'Revision Required');
});

test('every submission event has a label', () => {
  for (const event of ['submitted', 'resubmitted', 'revision_requested', 'approved']) {
    assert.ok(DTR_EVENT_LABEL[event], `event "${event}" has no label`);
  }
});
