import { describe, expect, it } from 'vitest';

import { validatePassword } from '@/lib/validation';

describe('validatePassword', () => {
  it('rejects empty or invalid runtime values', () => {
    const result = validatePassword(undefined as unknown as string);

    expect(result).toEqual({
      isValid: false,
      message: 'Password is required.',
    });
  });

  it('rejects passwords shorter than 8 characters', () => {
    const result = validatePassword('Ab1!xyz');

    expect(result).toEqual({
      isValid: false,
      message: 'Password must be at least 8 characters long.',
    });
  });

  it('rejects passwords without uppercase letters', () => {
    const result = validatePassword('abc1234!');

    expect(result).toEqual({
      isValid: false,
      message: 'Password must contain at least one uppercase letter.',
    });
  });

  it('rejects passwords without numbers', () => {
    const result = validatePassword('Abcdefg!');

    expect(result).toEqual({
      isValid: false,
      message: 'Password must contain at least one number.',
    });
  });

  it('rejects passwords without special characters', () => {
    const result = validatePassword('Abcdefg1');

    expect(result).toEqual({
      isValid: false,
      message: 'Password must contain at least one special character.',
    });
  });

  it('accepts strong passwords', () => {
    const result = validatePassword('StrongP@ss1');

    expect(result).toEqual({
      isValid: true,
      message: '',
    });
  });
});
