import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isoToZonedLocal,
  validateSessionDraft,
  zonedLocalToIso,
} from './timesheetCorrection.ts';

const MANILA = 'Asia/Manila'; // UTC+8, no DST.

test('a datetime-local value is read in the attendance zone, not the browser zone', () => {
  // 1:30 PM in Manila is 05:30 UTC, regardless of where the admin's browser is.
  // The functions always pass timeZone explicitly, so the machine's own TZ
  // (which may be anything on CI) never leaks in.
  assert.equal(zonedLocalToIso('2026-09-16T13:30', MANILA), '2026-09-16T05:30:00.000Z');
  assert.equal(zonedLocalToIso('2026-09-16T00:00', MANILA), '2026-09-15T16:00:00.000Z');
});

test('isoToZonedLocal renders the wall-clock time for the attendance zone', () => {
  assert.equal(isoToZonedLocal('2026-09-16T05:30:00.000Z', MANILA), '2026-09-16T13:30');
});

test('a session crossing local midnight lands on the correct attendance day', () => {
  // 16:30 UTC is 00:30 the NEXT day in Manila.
  assert.equal(isoToZonedLocal('2026-09-16T16:30:00.000Z', MANILA), '2026-09-17T00:30');
  // And the round trip is stable.
  assert.equal(zonedLocalToIso('2026-09-17T00:30', MANILA), '2026-09-16T16:30:00.000Z');
});

test('zoned conversion round-trips for any wall-clock value', () => {
  for (const local of ['2026-01-01T08:00', '2026-06-30T23:59', '2026-12-31T00:15']) {
    assert.equal(isoToZonedLocal(zonedLocalToIso(local, MANILA), MANILA), local);
  }
});

test('blank inputs convert to empty strings, never to epoch', () => {
  assert.equal(zonedLocalToIso('', MANILA), '');
  assert.equal(isoToZonedLocal(null, MANILA), '');
  assert.equal(isoToZonedLocal('', MANILA), '');
});

// ── validateSessionDraft mirrors the server messages exactly ──────────────────

const iso = (local: string) => zonedLocalToIso(local, MANILA);
// A fixed "now" well after the test dates, so nothing is spuriously in the future.
const NOW = new Date('2027-01-01T00:00:00Z').getTime();

test('both clock-in and clock-out are required', () => {
  assert.deepEqual(
    validateSessionDraft({ clockIn: null, clockOut: iso('2026-09-16T17:00'), breakStart: null, breakEnd: null }, NOW),
    { ok: false, error: 'Clock-in and clock-out are both required.' },
  );
});

test('a reversed range is rejected', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T17:00'), clockOut: iso('2026-09-16T09:00'), breakStart: null, breakEnd: null },
    NOW,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Clock-out must be later than clock-in.');
});

test('a clock-out in the future is rejected', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T09:00'), clockOut: iso('2026-09-16T17:00'), breakStart: null, breakEnd: null },
    new Date('2026-09-16T06:00:00Z').getTime(), // now = 14:00 Manila, before the 17:00 clock-out
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'A clock record cannot end in the future.');
});

test('a session longer than 24 hours is rejected', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-15T08:00'), clockOut: iso('2026-09-16T09:00'), breakStart: null, breakEnd: null },
    NOW,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'A single session cannot exceed 24 hours.');
});

test('a half-set break is rejected', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T09:00'), clockOut: iso('2026-09-16T17:00'), breakStart: iso('2026-09-16T12:00'), breakEnd: null },
    NOW,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'The break must start and end inside the session.');
});

test('a break outside the session is rejected', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T09:00'), clockOut: iso('2026-09-16T17:00'), breakStart: iso('2026-09-16T08:00'), breakEnd: iso('2026-09-16T12:00') },
    NOW,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'The break must start and end inside the session.');
});

test('a well-formed session with a break inside it passes', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T09:00'), clockOut: iso('2026-09-16T18:00'), breakStart: iso('2026-09-16T12:00'), breakEnd: iso('2026-09-16T13:00') },
    NOW,
  );
  assert.deepEqual(r, { ok: true, error: null });
});

test('a well-formed session with no break passes', () => {
  const r = validateSessionDraft(
    { clockIn: iso('2026-09-16T09:00'), clockOut: iso('2026-09-16T17:00'), breakStart: null, breakEnd: null },
    NOW,
  );
  assert.deepEqual(r, { ok: true, error: null });
});
