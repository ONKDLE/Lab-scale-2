import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, requestLogin, requestRegister } from '../api/auth';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import { useToast } from '../components/Toast';
import type { User } from '../types/auth';
import { clearToken, getToken, setToken } from './tokenStorage';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** 사용자가 직접 로그아웃했는지. 직접 로그아웃하면 다시 로그인할 때 "방금 보던 화면"으로 돌려보내지 않는다. */
  explicitLogout: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** 가입하고 바로 로그인까지 한다. */
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  // 저장된 토큰이 있으면 "확인 중"에서 시작한다. (확인이 끝나기 전에 로그인 화면으로 튕기지 않게)
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<User | null>(null);
  const [explicitLogout, setExplicitLogout] = useState(false);

  // 새로고침해도 로그인이 유지되도록, 저장된 토큰으로 내 정보를 다시 받아온다.
  useEffect(() => {
    if (!getToken()) return;
    const controller = new AbortController();
    getMe(controller.signal)
      .then((me) => {
        if (controller.signal.aborted) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // 토큰이 거절된 경우(401)만 지운다. 서버가 잠깐 꺼진 경우는 토큰을 남겨 둔다.
        if (error instanceof ApiError && error.status === 401) clearToken();
        setUser(null);
        setStatus('anonymous');
      });
    return () => controller.abort();
  }, []);

  const clearSession = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  /** 사용자가 직접 로그아웃 */
  const logout = useCallback(() => {
    clearSession();
    setExplicitLogout(true);
  }, [clearSession]);

  // 사용 중에 서버가 401(토큰 만료 등)을 주면 로그아웃시키고 알려준다.
  // 이 경우는 직접 로그아웃한 게 아니므로, 다시 로그인하면 보던 화면으로 돌아가게 둔다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!getToken()) return; // 이미 로그아웃된 상태면 한 번만 알린다
      clearSession();
      toast.info('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, toast]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await requestLogin(email, password);
    setToken(access_token);
    try {
      setUser(await getMe());
      setExplicitLogout(false);
      setStatus('authenticated');
    } catch (error) {
      clearToken();
      throw error;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await requestRegister(email, password);
      await login(email, password);
    },
    [login],
  );

  const value = useMemo(
    () => ({ status, user, explicitLogout, login, register, logout }),
    [status, user, explicitLogout, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
  return context;
}
