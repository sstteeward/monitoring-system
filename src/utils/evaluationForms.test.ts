import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVALUATION_CRITERIA,
  EVALUATION_SECTIONS,
  MAX_TEMPLATE_BYTES,
  TemplateFileError,
  buildTemplatePath,
  computeScore,
  describeDeadline,
  hasPdfSignature,
  isComplete,
  isPending,
  ratedCount,
  ratingLabel,
  validatePdfMetadata,
  type EvaluationScores,
} from './evaluationForms.ts';

const COMPANY = '793f2a5e-41ee-4a1b-8da7-95eb85134493';
const FILE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** Every criterion rated the same, which makes the expected mean obvious. */
const allRated = (value: number): EvaluationScores =>
  Object.fromEntries(EVALUATION_CRITERIA.map(c => [c.key, value])) as EvaluationScores;

test('the sections cover the rubric exactly once', () => {
  const fromSections = EVALUATION_SECTIONS.flatMap(s => s.criteria.map(c => c.key));
  assert.equal(fromSections.length, 11, 'the institution rubric has eleven criteria');
  assert.equal(new Set(fromSections).size, 11, 'no criterion appears in two sections');
  assert.deepEqual(fromSections, EVALUATION_CRITERIA.map(c => c.key));
});

test('a score is only produced once every criterion is rated', () => {
  const partial: EvaluationScores = { attendance_score: 5, punctuality_score: 4 };
  assert.equal(ratedCount(partial), 2);
  assert.equal(isComplete(partial), false);
  assert.equal(computeScore(partial), null, 'a mean of a subset would read as a score and mean nothing');

  assert.equal(isComplete(allRated(4)), true);
  assert.deepEqual(computeScore(allRated(4)), { rating: 4, percentage: 80 });
  assert.deepEqual(computeScore(allRated(5)), { rating: 5, percentage: 100 });
  assert.deepEqual(computeScore(allRated(1)), { rating: 1, percentage: 20 });
});

test('the browser score matches what the database stores', () => {
  // The same mixed ratings the migration was verified with: ten 5s and 4s
  // averaging 4.64, which the database rounded to 92.73%.
  const scores: EvaluationScores = {
    attendance_score: 5, punctuality_score: 5, communication_score: 4, professionalism_score: 5,
    technical_skills_score: 4, problem_solving_score: 4, teamwork_score: 5, initiative_score: 4,
    adaptability_score: 5, work_quality_score: 5, responsibility_score: 5,
  };
  const result = computeScore(scores);
  assert.equal(result?.rating, 4.64);
  assert.equal(result?.percentage, 92.73);
});

test('an out-of-range rating does not count as rated', () => {
  assert.equal(ratedCount({ attendance_score: 0 }), 0, '0 is the "unrated" the old form used');
  assert.equal(ratedCount({ attendance_score: 6 }), 0);
  assert.equal(ratedCount({ attendance_score: null }), 0);
  assert.equal(ratedCount({ attendance_score: 1 }), 1);
});

test('ratings read as words on the form', () => {
  assert.equal(ratingLabel(5), 'Excellent');
  assert.equal(ratingLabel(3), 'Good');
  assert.equal(ratingLabel(1), 'Poor');
  assert.equal(ratingLabel(null), '—');
});

test('only unfinished evaluations are pending work for the company', () => {
  assert.equal(isPending('not_started'), true);
  assert.equal(isPending('in_progress'), true);
  assert.equal(isPending('submitted'), false);
  assert.equal(isPending('reviewed'), false);
});

test('a deadline is counted in whole school-timezone days', () => {
  // 2026-09-09 late evening UTC is already the 10th in Manila; a deadline of the
  // 10th is "due today" there, not "due tomorrow".
  const lateUtc = new Date('2026-09-09T18:00:00Z');
  assert.equal(describeDeadline('2026-09-10', lateUtc).text, 'Due today');

  const morning = new Date('2026-09-09T02:00:00Z');
  assert.equal(describeDeadline('2026-09-30', morning).text, 'Due in 21 days');
  assert.equal(describeDeadline('2026-09-10', morning).text, 'Due tomorrow');
  assert.equal(describeDeadline('2026-09-09', morning).text, 'Due today');
  assert.equal(describeDeadline('2026-09-08', morning).text, 'Overdue by 1 day');
  assert.equal(describeDeadline('2026-09-01', morning).text, 'Overdue by 8 days');
  assert.equal(describeDeadline(null, morning).tone, 'none');
});

test('a deadline within the week is flagged before it is missed', () => {
  const now = new Date('2026-09-09T02:00:00Z');
  assert.equal(describeDeadline('2026-09-30', now).tone, 'ok');
  assert.equal(describeDeadline('2026-09-14', now).tone, 'soon');
  assert.equal(describeDeadline('2026-09-08', now).tone, 'overdue');
});

test('only PDFs can be filed as the official document', () => {
  assert.doesNotThrow(() => validatePdfMetadata({ name: 'form.pdf', type: 'application/pdf', size: 2048 }));
  assert.doesNotThrow(() => validatePdfMetadata({ name: 'form.PDF', type: '', size: 2048 }));
  assert.throws(() => validatePdfMetadata({ name: 'form.docx', type: 'application/msword', size: 2048 }), TemplateFileError);
  assert.throws(() => validatePdfMetadata({ name: 'form.pdf', type: 'application/pdf', size: 0 }), TemplateFileError);
  assert.throws(
    () => validatePdfMetadata({ name: 'form.pdf', type: 'application/pdf', size: MAX_TEMPLATE_BYTES + 1 }),
    TemplateFileError,
  );
});

test('the PDF signature is what proves a file is a PDF', () => {
  assert.equal(hasPdfSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(hasPdfSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), false, 'a renamed PNG');
  assert.equal(hasPdfSignature(new Uint8Array([0x25, 0x50])), false, 'a truncated header');
});

test('a template path is built from the company and type, never from the filename', () => {
  assert.equal(
    buildTemplatePath(COMPANY, 'annex_b', FILE_ID),
    `${COMPANY}/sil-templates/annex_b/${FILE_ID}.pdf`,
  );
  // The first segment must be the company's own folder: that is what lets the
  // existing company_documents policy hand the file to its students.
  assert.ok(buildTemplatePath(COMPANY, 'evaluation', FILE_ID).startsWith(`${COMPANY}/sil-templates/`));

  assert.throws(() => buildTemplatePath('../../etc', 'annex_b', FILE_ID), TemplateFileError);
  assert.throws(() => buildTemplatePath(COMPANY, 'annex_b', '../evil'), TemplateFileError);
  assert.throws(() => buildTemplatePath(COMPANY, 'annex_x' as 'annex_b', FILE_ID), TemplateFileError);
});
