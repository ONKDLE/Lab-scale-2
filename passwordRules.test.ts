import { describe, expect, it } from 'vitest';
import { passwordProblem } from './passwordRules';

describe('passwordProblem (백엔드와 같은 규칙)', () => {
  it('8자 이상, 영문+숫자면 통과', () => {
    expect(passwordProblem('mypass1234')).toBeNull();
    expect(passwordProblem('가나다라abc123')).toBeNull();
  });

  it.each([
    ['abc123', '8자 이상'],
    ['abcdefgh', '영문과 숫자'],
    ['12345678', '영문과 숫자'],
    ['a1'.repeat(37), '72바이트'],
    ['가'.repeat(25) + 'a1', '72바이트'],
  ])('규칙을 어기면 이유를 알려준다 (%s)', (password, keyword) => {
    expect(passwordProblem(password)).toContain(keyword);
  });
});
