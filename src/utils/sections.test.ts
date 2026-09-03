/**
 * Section naming rules: A–J must be available for every course + year level.
 * Run with: npm run test:sections
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SECTION_LETTERS,
    buildSectionName,
    buildSectionOptions,
    canonicalSectionName,
    courseCodeFromValue,
    parseSectionName,
    studentMatchesSection,
    yearNumberFromLevel,
} from './sections.ts';

/** The handful of rows the original schema seeded — deliberately only A–C. */
const SEEDED_SECTIONS = [
    { name: 'DHT-1A', course_code: 'DHT' },
    { name: 'DHT-1B', course_code: 'DHT' },
    { name: 'DHT-1C', course_code: 'DHT' },
    { name: 'DHT-2A', course_code: 'DHT' },
    { name: 'DHT-2B', course_code: 'DHT' },
    { name: 'DIT-1A', course_code: 'DIT' },
    { name: 'DIT-1B', course_code: 'DIT' },
    { name: 'DIT-1C', course_code: 'DIT' },
    { name: 'DIT-2A', course_code: 'DIT' },
    { name: 'DIT-2B', course_code: 'DIT' },
];

test('year levels and course codes are parsed from form values', () => {
    assert.equal(yearNumberFromLevel('1st Year'), 1);
    assert.equal(yearNumberFromLevel('3rd Year'), 3);
    assert.equal(yearNumberFromLevel('4th Year'), 4);
    assert.equal(yearNumberFromLevel(''), null);
    assert.equal(yearNumberFromLevel(null), null);

    assert.equal(courseCodeFromValue('DIT'), 'DIT');
    assert.equal(courseCodeFromValue(' dht '), 'DHT');
    assert.equal(courseCodeFromValue('Bachelor of Science in Information Technology'), '');
});

test('section names compose and decompose', () => {
    assert.equal(buildSectionName('DIT', 3, 'A'), 'DIT-3A');
    assert.equal(buildSectionName('dit', 3, 'j'), 'DIT-3J');

    assert.deepEqual(parseSectionName('DIT-3A'), { courseCode: 'DIT', year: 3, letter: 'A' });
    assert.deepEqual(parseSectionName('DHT-4J'), { courseCode: 'DHT', year: 4, letter: 'J' });
    assert.equal(parseSectionName('Section A'), null);
    assert.equal(parseSectionName(''), null);
});

test('A–J is offered for every course and year level, not just the seeded rows', () => {
    for (const course of ['DIT', 'DHT', 'BSIT']) {
        for (const [index, yearLevel] of ['1st Year', '2nd Year', '3rd Year', '4th Year'].entries()) {
            const year = index + 1;
            const options = buildSectionOptions({ course, yearLevel, sections: SEEDED_SECTIONS });
            const values = options.map(o => o.value);

            for (const letter of SECTION_LETTERS) {
                assert.ok(
                    values.includes(`${course}-${year}${letter}`),
                    `${course} ${yearLevel} is missing section ${letter}`
                );
            }
            // Exactly A–J for that course + year, nothing from another year.
            assert.equal(values.length, 10, `${course} ${yearLevel} should offer exactly 10 sections`);
            assert.equal(options[0].label, `${course}-${year}A (${course})`);
        }
    }
});

test('sections from other courses and years are filtered out', () => {
    const values = buildSectionOptions({
        course: 'DIT',
        yearLevel: '1st Year',
        sections: SEEDED_SECTIONS,
    }).map(o => o.value);

    assert.ok(!values.some(v => v.startsWith('DHT')), 'DHT sections must not appear for a DIT student');
    assert.ok(!values.includes('DIT-2A'), '2nd year sections must not appear for a 1st year student');
});

test('every year is offered while the year level is still unset', () => {
    const values = buildSectionOptions({ course: 'DIT', yearLevel: '', sections: SEEDED_SECTIONS }).map(o => o.value);
    assert.equal(values.length, 40);
    assert.ok(values.includes('DIT-1A'));
    assert.ok(values.includes('DIT-4J'));
});

test('coordinator-created and legacy section names are preserved', () => {
    // A name outside the generated pattern must still be selectable.
    const sections = [...SEEDED_SECTIONS, { name: 'DIT-SPECIAL', course_code: 'DIT' }];
    const values = buildSectionOptions({ course: 'DIT', yearLevel: '1st Year', sections }).map(o => o.value);
    assert.ok(values.includes('DIT-SPECIAL'));

    // And a value already saved on the profile is never dropped, even when the
    // student's course/year no longer matches it.
    const withCurrent = buildSectionOptions({
        course: 'DIT',
        yearLevel: '1st Year',
        sections: SEEDED_SECTIONS,
        currentValue: 'DHT-2B',
    }).map(o => o.value);
    assert.ok(withCurrent.includes('DHT-2B'));
});

test('falls back to stored rows when no course is selected', () => {
    const values = buildSectionOptions({ course: '', yearLevel: '', sections: SEEDED_SECTIONS }).map(o => o.value);
    assert.deepEqual(values, SEEDED_SECTIONS.map(s => s.name));

    assert.deepEqual(buildSectionOptions({ course: '', yearLevel: '', sections: [] }), []);
});

// ─── canonicalSectionName / studentMatchesSection ───────────────────────────
// These are what the adviser roster and every student count compare on, so the
// legacy shapes actually present in the database are pinned here.

test('canonicalSectionName passes through an already-canonical name', () => {
    assert.equal(canonicalSectionName('DIT-3F', 'DIT', '3rd Year'), 'DIT-3F');
    assert.equal(canonicalSectionName('dit-3f', 'DIT', '3rd Year'), 'DIT-3F');
});

test('canonicalSectionName rebuilds a legacy bare letter from course and year', () => {
    assert.equal(canonicalSectionName('A', 'DIT', '1st Year'), 'DIT-1A');
    assert.equal(canonicalSectionName('a', 'DIT', '2nd Year'), 'DIT-2A');
    assert.equal(canonicalSectionName('b', 'DIT', '1st Year'), 'DIT-1B');
    assert.equal(canonicalSectionName('D', 'DHT', '3rd Year'), 'DHT-3D');
});

test('canonicalSectionName returns null when the student has no section', () => {
    assert.equal(canonicalSectionName(null, 'DIT', '1st Year'), null);
    assert.equal(canonicalSectionName('   ', 'DIT', '1st Year'), null);
});

test('canonicalSectionName keeps a bare letter when course or year is missing', () => {
    // Nothing to rebuild from, so it must not invent a name that would collide
    // with a real section.
    assert.equal(canonicalSectionName('A', null, '1st Year'), 'A');
    assert.equal(canonicalSectionName('A', 'DIT', null), 'A');
});

test('studentMatchesSection scopes a roster to exactly one section', () => {
    const inFirstA = { section: 'A', course: 'DIT', year_level: '1st Year' };
    const inFirstB = { section: 'b', course: 'DIT', year_level: '1st Year' };
    const inSecondA = { section: 'A', course: 'DIT', year_level: '2nd Year' };

    assert.ok(studentMatchesSection(inFirstA, 'DIT-1A'));
    assert.ok(!studentMatchesSection(inFirstA, 'DIT-1B'));
    assert.ok(!studentMatchesSection(inFirstA, 'DIT-2A'));

    assert.ok(studentMatchesSection(inFirstB, 'DIT-1B'));
    assert.ok(studentMatchesSection(inSecondA, 'DIT-2A'));
    assert.ok(!studentMatchesSection(inSecondA, 'DIT-1A'));

    // Same letter, different course must never bleed across.
    assert.ok(!studentMatchesSection({ section: 'D', course: 'DHT', year_level: '3rd Year' }, 'DIT-3D'));
});
