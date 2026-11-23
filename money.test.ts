import { describe, expect, it } from 'vitest';
import { makeTransaction } from '../test/helpers';
import { summarizeActive } from './money';

describe('summarizeActive', () => {
  it('정상 거래만 건수와 합계에 넣는다', () => {
    const result = summarizeActive([
      makeTransaction({ id: 1, amount: '4400.00' }),
      makeTransaction({ id: 2, amount: '10000.00' }),
      makeTransaction({ id: 3, amount: '10000.00', status: 'CANCELLED' }),
    ]);
    expect(result).toEqual({ count: 2, total: '14400.00' });
  });

  it('거래가 없거나 전부 취소되면 0건 / 0.00', () => {
    expect(summarizeActive([])).toEqual({ count: 0, total: '0.00' });
    expect(summarizeActive([makeTransaction({ status: 'CANCELLED' })])).toEqual({ count: 0, total: '0.00' });
  });

  it('소수점 합계에 오차가 없다 (0.10 + 0.20 = 0.30)', () => {
    const result = summarizeActive([makeTransaction({ id: 1, amount: '0.10' }), makeTransaction({ id: 2, amount: '0.20' })]);
    expect(result.total).toBe('0.30');
  });

  it('백엔드가 주는 요약 규칙과 같다 (취소 제외, 2자리 문자열)', () => {
    expect(summarizeActive([makeTransaction({ amount: '1234.56' }), makeTransaction({ id: 2, amount: '4400.00' })]).total).toBe('5634.56');
  });
});
