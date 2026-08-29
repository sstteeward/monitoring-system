export type PasswordRequirementKey = 'length' | 'uppercase' | 'lowercase' | 'number' | 'special' | 'match';

export const passwordRequirementLabels: Record<PasswordRequirementKey, string> = {
  length: 'At least 8 characters',
  uppercase: 'At least 1 uppercase letter (A–Z)',
  lowercase: 'At least 1 lowercase letter (a–z)',
  number: 'At least 1 number (0–9)',
  special: 'At least 1 special character (! @ # $ % ^ & *)',
  match: 'Passwords match',
};

export const validatePassword = (password: string, confirmation = '') => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: Boolean(password) && password === confirmation,
  };
  const strengthScore = Object.entries(requirements)
    .filter(([key, met]) => key !== 'match' && met)
    .length;
  const strength = strengthScore <= 2 ? 'Weak' : strengthScore <= 4 ? 'Medium' : 'Strong';
  return {
    requirements,
    strengthScore,
    strength,
    isValid: Object.values(requirements).every(Boolean),
  };
};

export const passwordRequirementsMessage = 'Use at least 8 characters with uppercase and lowercase letters, a number, and a special character.';
