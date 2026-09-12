import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicateStudentNumber,
  normaliseStudentNumber,
  validateStudentNumber,
} from './studentNumber.ts';

test('the numbers printed on the official grading sheet are accepted', () => {
  // Straight from the reference sheet.
  for (const value of ['2023-24610795', '2023-24610796', '2023-24610819']) {
    const result = validateStudentNumber(value);
    assert.equal(result.ok, true, `${value} must be accepted`);
    assert.equal(result.value, value);
    assert.equal(result.error, null);
  }
});

test('a blank clears the field rather than failing registration', () => {
  // The registrar issues the number; a student who does not have it to hand
  // must still be able to finish registering. The adviser fills the gap later.
  for (const blank of ['', '   ', null, undefined]) {
    assert.deepEqual(validateStudentNumber(blank), { ok: true, value: null, error: null });
  }
});

test('pasted dashes and stray spaces are normalised, not rejected', () => {
  // Copying from a registration form or a spreadsheet routinely brings these.
  assert.equal(validateStudentNumber('2023–24610795').value, '2023-24610795', 'en dash');
  assert.equal(validateStudentNumber('2023—24610795').value, '2023-24610795', 'em dash');
  assert.equal(validateStudentNumber('2023－24610795').value, '2023-24610795', 'full-width');
  assert.equal(validateStudentNumber('  2023-24610795  ').value, '2023-24610795');
  assert.equal(validateStudentNumber('2023 - 24610795').value, '2023-24610795');
});

test('malformed numbers are rejected with a usable message', () => {
  for (const bad of ['24610795', '2023/24610795', '2023-', 'AB23-24610795', '2023-246107952222222', '23-2461']) {
    const result = validateStudentNumber(bad);
    assert.equal(result.ok, false, `${bad} must be rejected`);
    assert.equal(result.value, null);
    assert.ok(result.error);
  }
});

test('an impossible admission year is treated as a typo', () => {
  const future = String(new Date().getFullYear() + 5);
  assert.equal(validateStudentNumber(`${future}-24610795`).ok, false);
  assert.equal(validateStudentNumber('1023-24610795').ok, false);
  // Next year is legitimate — students are admitted ahead of the school year.
  const nextYear = String(new Date().getFullYear() + 1);
  assert.equal(validateStudentNumber(`${nextYear}-24610795`).ok, true);
});

test('normalisation is what comparisons and lookups use', () => {
  assert.equal(normaliseStudentNumber(' 2023–24610795 '), '2023-24610795');
  assert.equal(normaliseStudentNumber('nonsense'), null);
  assert.equal(normaliseStudentNumber(''), null);
});

test('a number reused within one section is caught before saving', () => {
  // Two students cannot share a student number; the database has a unique
  // index, but the adviser should hear about it before the round trip.
  const clash = findDuplicateStudentNumber([
    { key: 'a', studentNumber: '2023-24610795' },
    { key: 'b', studentNumber: '2023-24610796' },
    { key: 'c', studentNumber: '2023–24610795' },
  ]);
  assert.equal(clash, 'c', 'the second use of the number is the one flagged');

  assert.equal(
    findDuplicateStudentNumber([
      { key: 'a', studentNumber: '2023-24610795' },
      { key: 'b', studentNumber: null },
      { key: 'c', studentNumber: '' },
    ]),
    null,
    'blanks never collide with each other',
  );
});
