import { describe, expect, it } from 'vitest';
import { parseListState, parsePage, parseStatus, toSearchParams } from './listParams';

describe('parsePage', () => {
  it('정상적인 양의 정수는 그대로 쓴다', () => {
    expect(parsePage('2')).toBe(2);
    expect(parsePage('007')).toBe(7);
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', '1e3', '99999999999999999999'])(
    '이상한 값(%s)은 1페이지로 바꾼다',
    (raw) => {
      expect(parsePage(raw)).toBe(1);
    },
  );
});

describe('parseStatus', () => {
  it('ACTIVE, CANCELLED만 인정한다', () => {
    expect(parseStatus('ACTIVE')).toBe('ACTIVE');
    expect(parseStatus('CANCELLED')).toBe('CANCELLED');
  });

  it.each([null, '', 'DONE', 'active'])('그 외(%s)는 전체(undefined)로 본다', (raw) => {
    expect(parseStatus(raw)).toBeUndefined();
  });
});

describe('parseListState / toSearchParams', () => {
  it('주소창 값을 화면 상태로 바꾼다 (검색어 앞뒤 공백 제거)', () => {
    const state = parseListState(new URLSearchParams('page=3&status=ACTIVE&keyword=%20스타벅스%20'));
    expect(state).toEqual({ page: 3, status: 'ACTIVE', keyword: '스타벅스' });
  });

  it('기본값(1페이지, 전체, 검색어 없음)은 주소에 적지 않는다', () => {
    expect(toSearchParams({ page: 1, status: undefined, keyword: '' }).toString()).toBe('');
  });

  it('값이 있으면 모두 주소에 적는다', () => {
    const params = toSearchParams({ page: 2, status: 'CANCELLED', keyword: '스타벅스' });
    expect(params.get('page')).toBe('2');
    expect(params.get('status')).toBe('CANCELLED');
    expect(params.get('keyword')).toBe('스타벅스');
  });
});
