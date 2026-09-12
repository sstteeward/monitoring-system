import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GRADE_SCALE,
  calculateFinalGrade,
  canEditGrades,
  canFinalize,
  canReturn,
  canSubmit,
  canVerify,
  formatGrade,
  formatTerm,
  gradingProgress,
  remarksFor,
  validateFinalGrade,
  type ComponentScore,
  type GradingComponents,
} from './grading.ts';

const SCALE = DEFAULT_GRADE_SCALE;

test('remarks come from the grade and the sheet’s own passing mark', () => {
  assert.equal(remarksFor(85, 75), 'PASSED');
  assert.equal(remarksFor(75, 75), 'PASSED', 'the passing mark itself passes');
  assert.equal(remarksFor(74.99, 75), 'FAILED');
  // A different institution policy must change the answer, not the code.
  assert.equal(remarksFor(80, 85), 'FAILED');
});

test('a student with no grade has no remark', () => {
  // A blank row printing "FAILED" on an official document would be a fabricated
  // academic result.
  assert.equal(remarksFor(null, 75), null);
  assert.equal(remarksFor(undefined, 75), null);
  assert.equal(remarksFor(Number.NaN, 75), null);
});

test('a blank clears the grade rather than storing zero', () => {
  assert.deepEqual(validateFinalGrade('', SCALE), { ok: true, value: null, error: null });
  assert.deepEqual(validateFinalGrade('   ', SCALE), { ok: true, value: null, error: null });
  assert.deepEqual(validateFinalGrade(null, SCALE), { ok: true, value: null, error: null });
});

test('non-numeric input is rejected outright', () => {
  for (const bad of ['85a', 'N/A', '—', '=85', '1e2', 'Infinity', '0x10', '-5', '8.555']) {
    const result = validateFinalGrade(bad, SCALE);
    assert.equal(result.ok, false, `${bad} must be rejected`);
    assert.equal(result.value, null);
    assert.ok(result.error);
  }
});

test('grades outside the configured range are rejected, and the range is configurable', () => {
  assert.equal(validateFinalGrade('101', SCALE).ok, false);
  assert.equal(validateFinalGrade('100', SCALE).value, 100);
  assert.equal(validateFinalGrade('0', SCALE).value, 0);

  // A 1.00–5.00 institution scale must work without touching this file.
  const collegeScale = { min_grade: 1, max_grade: 5, passing_grade: 3 };
  assert.equal(validateFinalGrade('2.75', collegeScale).value, 2.75);
  assert.equal(validateFinalGrade('5.25', collegeScale).ok, false);
  assert.equal(validateFinalGrade('0.5', collegeScale).ok, false);
});

test('a valid grade keeps two decimal places, matching numeric(5,2)', () => {
  assert.equal(validateFinalGrade('87.5', SCALE).value, 87.5);
  assert.equal(validateFinalGrade('87.55', SCALE).value, 87.55);
  assert.equal(validateFinalGrade(93, SCALE).value, 93);
});

test('only a draft can be edited or submitted', () => {
  assert.equal(canEditGrades('draft'), true);
  for (const status of ['for_review', 'verified', 'finalized'] as const) {
    assert.equal(canEditGrades(status), false, `${status} must be read-only`);
    assert.equal(canSubmit(status), false);
  }
  assert.equal(canSubmit('draft'), true);
});

test('verification, return and finalization follow the workflow order', () => {
  assert.equal(canVerify('for_review'), true);
  assert.equal(canVerify('draft'), false);
  assert.equal(canVerify('verified'), false);

  // A coordinator may send back a sheet they already verified, but never a
  // finalized one.
  assert.equal(canReturn('for_review'), true);
  assert.equal(canReturn('verified'), true);
  assert.equal(canReturn('draft'), false);
  assert.equal(canReturn('finalized'), false);

  assert.equal(canFinalize('verified'), true);
  assert.equal(canFinalize('for_review'), false);
  assert.equal(canFinalize('finalized'), false);
});

const WEIGHTS: GradingComponents = {
  company_evaluation: 40,
  adviser_evaluation: 20,
  attendance: 20,
  journals: 10,
  requirements: 10,
};

test('the final grade is the weighted mean of the components that have data', () => {
  const components: ComponentScore[] = [
    { key: 'company_evaluation', score: 90 },
    { key: 'adviser_evaluation', score: 85 },
    { key: 'attendance', score: 100 },
    { key: 'journals', score: 80 },
    { key: 'requirements', score: 70 },
  ];
  // 90*.4 + 85*.2 + 100*.2 + 80*.1 + 70*.1 = 36 + 17 + 20 + 8 + 7 = 88
  const result = calculateFinalGrade(components, WEIGHTS, SCALE);
  assert.equal(result.grade, 88);
  assert.equal(result.coverage, 1);
  assert.deepEqual(result.missing, []);
});

test('a component with no data is excluded, never scored as zero', () => {
  const components: ComponentScore[] = [
    { key: 'company_evaluation', score: 90 },
    { key: 'adviser_evaluation', score: null },
    { key: 'attendance', score: 90 },
    { key: 'journals', score: null },
    { key: 'requirements', score: null },
  ];
  const result = calculateFinalGrade(components, WEIGHTS, SCALE);
  // Treating the missing 40 points of weight as zeros would give 54; the
  // student is graded on what exists, at 90.
  assert.equal(result.grade, 90);
  assert.deepEqual(result.missing, ['adviser_evaluation', 'journals', 'requirements']);
  assert.equal(Math.round(result.coverage * 100), 60, 'only 60% of the weighting was available');
});

test('no component data means no proposed grade at all', () => {
  const result = calculateFinalGrade(
    [{ key: 'company_evaluation', score: null }, { key: 'attendance', score: null }],
    WEIGHTS,
    SCALE,
  );
  assert.equal(result.grade, null);
  assert.equal(result.coverage, 0);
});

test('a component score cannot push the result outside the sheet’s range', () => {
  const result = calculateFinalGrade(
    [{ key: 'company_evaluation', score: 140 }],
    WEIGHTS,
    SCALE,
  );
  assert.equal(result.grade, 100);
});

test('a sheet is only complete when every student carries a grade', () => {
  assert.deepEqual(gradingProgress(22, 22), { complete: true, remaining: 0, percent: 100 });
  assert.deepEqual(gradingProgress(20, 22), { complete: false, remaining: 2, percent: 91 });
  // An empty sheet is not "complete" — there is nothing to certify.
  assert.deepEqual(gradingProgress(0, 0), { complete: false, remaining: 0, percent: 0 });
});

test('grades and terms are formatted the way the official sheet prints them', () => {
  assert.equal(formatGrade(85), '85');
  assert.equal(formatGrade(87.5), '87.5');
  assert.equal(formatGrade('93.00'), '93');
  assert.equal(formatGrade(null), '');
  assert.equal(formatTerm('2024-2025', 'SECOND'), '2024-2025 · Second Semester');
  assert.equal(formatTerm('2024-2025', ''), '2024-2025');
});
