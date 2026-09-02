/**
 * The four onboarding forms (Student, Adviser, Coordinator, Company) share these
 * rules. These tests are what stops them drifting apart again.
 * Run with: npm run test:onboarding
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EMPTY_ADDRESS_LEVELS,
    EMPTY_NAME_LEVELS,
    FIELD_LABELS,
    addressLevelsToProfileColumns,
    formatFullName,
    formatStructuredAddress,
    isAtLeast18,
    nameLevelsToProfileColumns,
    validateAddressLevels,
    validateBirthday,
    validateContactNumber,
    validateNameLevels,
    type AddressLevels,
    type NameLevels,
} from './onboardingFields.ts';

const fullName: NameLevels = {
    firstName: 'Juan',
    middleName: 'Santos',
    lastName: 'Dela Cruz',
    suffix: 'Jr.',
};

const fullAddress: AddressLevels = {
    country: 'Philippines',
    regionCode: '070000000',
    regionName: 'Region VII — Central Visayas',
    provinceCode: '074600000',
    provinceName: 'Negros Oriental',
    cityCode: '074611000',
    cityMunicipalityName: 'Dumaguete City',
    barangayCode: '074611001',
    barangayName: 'Poblacion',
    houseStreet: '12 Rizal Blvd',
};

test('name is captured by level, never combined', () => {
    const columns = nameLevelsToProfileColumns(fullName);
    assert.equal(columns.first_name, 'Juan');
    assert.equal(columns.middle_name, 'Santos');
    // The suffix must NOT be glued onto last_name (the old adviser behaviour).
    assert.equal(columns.last_name, 'Dela Cruz');
    assert.equal(columns.suffix, 'Jr.');
});

test('optional name levels persist as null, not empty strings', () => {
    const columns = nameLevelsToProfileColumns({ ...EMPTY_NAME_LEVELS, firstName: 'Ana', lastName: 'Reyes' });
    assert.equal(columns.middle_name, null);
    assert.equal(columns.suffix, null);
});

test('address is captured by level and also stored as a display string', () => {
    const columns = addressLevelsToProfileColumns(fullAddress);
    assert.equal(columns.region_code, '070000000');
    assert.equal(columns.province_code, '074600000');
    assert.equal(columns.city_municipality_code, '074611000');
    assert.equal(columns.barangay_code, '074611001');
    assert.equal(columns.house_street, '12 Rizal Blvd');
    assert.equal(
        columns.address,
        '12 Rizal Blvd, Barangay Poblacion, Dumaguete City, Negros Oriental, Philippines'
    );
});

test('formatters join the levels in a stable order', () => {
    assert.equal(formatFullName(fullName), 'Juan Santos Dela Cruz Jr.');
    assert.equal(formatFullName({ ...EMPTY_NAME_LEVELS, firstName: 'Ana', lastName: 'Reyes' }), 'Ana Reyes');
    assert.equal(formatStructuredAddress(EMPTY_ADDRESS_LEVELS), 'Philippines');
});

test('name validation requires first and last only', () => {
    assert.equal(validateNameLevels(fullName), null);
    assert.equal(validateNameLevels({ ...EMPTY_NAME_LEVELS, firstName: 'Ana', lastName: 'Reyes' }), null);
    assert.ok(validateNameLevels({ ...EMPTY_NAME_LEVELS, firstName: 'Ana' }));
    assert.ok(validateNameLevels({ ...EMPTY_NAME_LEVELS, lastName: 'Reyes' }));
    assert.ok(validateNameLevels({ ...fullName, firstName: '   ' }));
});

test('address validation requires every level down to house/street', () => {
    assert.equal(validateAddressLevels(fullAddress), null);
    for (const key of ['regionCode', 'provinceCode', 'cityCode', 'barangayCode', 'houseStreet'] as const) {
        assert.ok(
            validateAddressLevels({ ...fullAddress, [key]: '' }),
            `missing ${key} should be rejected`
        );
    }
});

test('contact number accepts 10-13 digits in any format', () => {
    assert.equal(validateContactNumber('09123456789'), null);
    assert.equal(validateContactNumber('+63 912 345 6789'), null);
    assert.ok(validateContactNumber(''));
    assert.ok(validateContactNumber('12345'));
    assert.ok(validateContactNumber('12345678901234'));
});

test('birthday requires a date and a minimum age of 18', () => {
    const today = new Date();
    // Format in local time — toISOString() shifts the date in non-UTC timezones.
    const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const exactly18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const almost18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate() + 1);

    assert.equal(validateBirthday(iso(exactly18)), null);
    assert.equal(isAtLeast18(iso(exactly18)), true);
    assert.ok(validateBirthday(iso(almost18)));
    assert.equal(isAtLeast18(iso(almost18)), false);
    assert.ok(validateBirthday(''));
    assert.equal(isAtLeast18('not-a-date'), false);
});

test('labels are shared so the four forms cannot drift apart', () => {
    assert.equal(FIELD_LABELS.firstName, 'First Name');
    assert.equal(FIELD_LABELS.middleName, 'Middle Name');
    assert.equal(FIELD_LABELS.lastName, 'Last Name');
    assert.equal(FIELD_LABELS.suffix, 'Suffix');
    assert.equal(FIELD_LABELS.region, 'Region');
    assert.equal(FIELD_LABELS.province, 'Province');
    assert.equal(FIELD_LABELS.cityMunicipality, 'City / Municipality');
    assert.equal(FIELD_LABELS.barangay, 'Barangay');
    assert.equal(FIELD_LABELS.houseStreet, 'House No. / Street');
});
