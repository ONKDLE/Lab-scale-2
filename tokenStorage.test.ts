import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, getToken, setToken } from './tokenStorage';

describe('tokenStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('저장한 토큰을 꺼내 쓰고, 지우면 없어진다', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
    expect(window.localStorage.getItem('mypin.accessToken')).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
    expect(window.localStorage.getItem('mypin.accessToken')).toBeNull();
  });

  it('브라우저가 저장소를 막아도 이번 방문 동안은 토큰이 유지된다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setToken('memory-only');
    expect(getToken()).toBe('memory-only');
  });
});
