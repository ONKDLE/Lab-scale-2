import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, tokenFor } from '../test/fakeApi';
import { mockFetch } from '../test/helpers';
import { renderApp } from '../test/renderApp';
import { getToken } from './tokenStorage';

const location = () => screen.getByTestId('location');

function setup(entry: Parameters<typeof renderApp>[0] = '/', as: number | null = null) {
  const api = createFakeApi();
  mockFetch(api.handler);
  renderApp(entry, { token: as ? tokenFor(as) : null });
  return { api, user: userEvent.setup() };
}

async function fillLogin(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('이메일'), email);
  await user.type(screen.getByLabelText('비밀번호'), password);
}

describe('로그인 보호', () => {
  it('로그인하지 않고 주소를 열면 로그인 화면으로 보내고, 서버에는 요청하지 않는다', async () => {
    const { api } = setup('/categories');
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/login');
    expect(api.calls).toHaveLength(0);
  });

  it('로그인하면 처음 열려던 화면으로 돌아간다', async () => {
    const { user } = setup('/categories/1');
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/categories/1');
  });

  it('돌아갈 주소가 외부 주소(//evil.com)로 꾸며져 있어도 따라가지 않고 처음 화면으로 간다', async () => {
    const { user } = setup({ pathname: '/login', state: { from: '//evil.com' } });
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('heading', { name: '거래 내역' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
  });

  it('로그인한 사용자가 /login 을 열면 처음 화면으로 보낸다', async () => {
    setup('/login', 1);
    expect(await screen.findByRole('heading', { name: '거래 내역' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
  });

  it('없는 주소는 "페이지를 찾을 수 없습니다."를 보여준다', async () => {
    setup('/nope', 1);
    expect(await screen.findByText('페이지를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/');
  });
});

describe('로그인', () => {
  it('성공하면 토큰을 저장하고, 이후 요청마다 토큰을 붙이고, 메뉴에 내 이메일이 보인다', async () => {
    const { api, user } = setup('/login');
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('test@mypin.dev')).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
    expect(getToken()).toBe('token-1');
    expect(window.localStorage.getItem('mypin.accessToken')).toBe('token-1');

    const loginBody = new URLSearchParams(api.callsTo('POST', /auth\/login/)[0].body);
    expect(loginBody.get('username')).toBe('test@mypin.dev');
    const authorized = api.callsTo('GET', /^\/transactions$/);
    expect(authorized.length).toBeGreaterThan(0);
    expect(authorized[0].headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('비밀번호가 틀리면 안내 문구를 보여주고, 토큰은 저장하지 않으며, 다시 시도할 수 있다', async () => {
    const { user } = setup('/login');
    await fillLogin(user, 'test@mypin.dev', 'wrongpass1');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.');
    expect(getToken()).toBeNull();
    expect(location()).toHaveTextContent('/login');
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });

  it('입력이 비어 있으면 서버에 보내지 않고 안내한다', async () => {
    const { api, user } = setup('/login');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('alert')).toHaveTextContent('이메일과 비밀번호를 입력해 주세요.');
    expect(api.calls).toHaveLength(0);
  });

  it('서버에 연결되지 않으면 연결 실패를 안내한다', async () => {
    const { api, user } = setup('/login');
    api.failNext('POST', /auth\/login/, 'network-error');
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  });

  it('처리 중에는 버튼이 잠겨서 두 번 눌러도 한 번만 요청한다', async () => {
    const { api, user } = setup('/login');
    const hold = api.hold('POST', /auth\/login/);
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    const busyButton = await screen.findByRole('button', { name: '로그인 중…' });
    expect(busyButton).toBeDisabled();
    await user.click(busyButton);
    hold.release();

    expect(await screen.findByText('test@mypin.dev')).toBeInTheDocument();
    expect(api.callsTo('POST', /auth\/login/)).toHaveLength(1);
  });

  it('회원가입 / 로그인 링크로 화면을 오갈 수 있다', async () => {
    const { user } = setup('/login');
    await user.click(screen.getByRole('link', { name: '회원가입' }));
    expect(location()).toHaveTextContent('/register');
    await user.click(screen.getByRole('link', { name: '로그인' }));
    expect(location()).toHaveTextContent('/login');
  });
});

describe('로그인 유지 / 로그아웃 / 만료', () => {
  it('새로고침해도 저장된 토큰으로 로그인이 유지된다 (확인하는 동안 안내 문구를 보여준다)', async () => {
    const { api } = setup('/', 1);
    const meCalls = () => api.callsTo('GET', /auth\/me/);
    expect(await screen.findByText('test@mypin.dev')).toBeInTheDocument();
    expect(meCalls()).toHaveLength(1);
    expect(location()).toHaveTextContent(/^\/$/);
  });

  it('확인이 끝나기 전에는 로그인 화면으로 튕기지 않고 "확인하는 중"을 보여준다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    const hold = api.hold('GET', /auth\/me/);
    renderApp('/categories', { token: tokenFor(1) });

    expect(screen.getByRole('status')).toHaveTextContent('로그인 정보를 확인하는 중');
    expect(location()).toHaveTextContent('/categories');
    hold.release();
    expect(await screen.findByText('test@mypin.dev')).toBeInTheDocument();
  });

  it('저장된 토큰이 거절되면(계정 없음 등) 토큰을 지우고 로그인 화면으로 간다 (만료 알림은 띄우지 않음)', async () => {
    setup('/', 99);
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(screen.queryByText(/만료/)).not.toBeInTheDocument();
  });

  it('로그아웃하면 토큰이 지워지고, 다시 로그인했을 때 이전 화면이 아니라 처음 화면으로 간다', async () => {
    const { user } = setup('/categories/1', 1);
    await screen.findByRole('heading', { name: '카페' });

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/login$/);
    expect(getToken()).toBeNull();

    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('heading', { name: '거래 내역' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
  });

  it('사용 중에 토큰이 만료되면(401) 로그아웃시키고 알림을 띄운 뒤 로그인 화면으로 보낸다', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    api.failNext('GET', /^\/categories$/, { status: 401, body: { detail: '로그인이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.' } });
    renderApp('/categories', { token: tokenFor(1) });

    expect(await screen.findByText('로그인이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/login');
    expect(getToken()).toBeNull();
    expect(screen.queryByText('거래 내역을 불러오지 못했습니다.')).not.toBeInTheDocument();
  });
});

describe('만료 후 다시 로그인', () => {
  it('만료되어 로그아웃된 경우에는 다시 로그인하면 보던 화면으로 돌아간다 (직접 로그아웃과 다름)', async () => {
    const api = createFakeApi();
    mockFetch(api.handler);
    api.failNext('GET', /categories\/1$/, { status: 401, body: { detail: '로그인이 만료되었거나 올바르지 않습니다.' } });
    renderApp('/categories/1', { token: tokenFor(1) });
    const user = userEvent.setup();

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    await fillLogin(user, 'test@mypin.dev', 'mypin1234');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('heading', { name: '카페' })).toBeInTheDocument();
    expect(location()).toHaveTextContent('/categories/1');
  });
});

describe('회원가입', () => {
  async function fillRegister(user: ReturnType<typeof userEvent.setup>, email: string, password: string, confirm: string) {
    if (email) await user.type(screen.getByLabelText('이메일'), email);
    if (password) await user.type(screen.getByLabelText('비밀번호'), password);
    if (confirm) await user.type(screen.getByLabelText('비밀번호 확인'), confirm);
    await user.click(screen.getByRole('button', { name: '가입하기' }));
  }

  it.each([
    ['이메일이 비어 있음', '', 'mypass1234', 'mypass1234', '이메일을 입력해 주세요.'],
    ['8자 미만', 'a@b.com', 'abc123', 'abc123', '8자 이상'],
    ['숫자 없음', 'a@b.com', 'abcdefgh', 'abcdefgh', '영문과 숫자'],
    ['영문 없음', 'a@b.com', '12345678', '12345678', '영문과 숫자'],
    ['비밀번호 확인 불일치', 'a@b.com', 'mypass1234', 'mypass12345', '비밀번호 확인이 일치하지 않습니다.'],
  ])('입력이 규칙에 맞지 않으면(%s) 서버에 보내지 않고 안내한다', async (_label, email, password, confirm, message) => {
    const { api, user } = setup('/register');
    await fillRegister(user, email, password, confirm);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(api.calls).toHaveLength(0);
  });

  it('가입에 성공하면 바로 로그인되어 처음 화면으로 간다', async () => {
    const { api, user } = setup('/register');
    await fillRegister(user, 'new@example.com', 'mypass1234', 'mypass1234');

    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/$/);
    expect(JSON.parse(api.callsTo('POST', /auth\/register/)[0].body!)).toEqual({ email: 'new@example.com', password: 'mypass1234' });
    expect(api.callsTo('POST', /auth\/login/)).toHaveLength(1);
    expect(getToken()).toBe('token-3');
  });

  it('이미 가입된 이메일이면 서버의 안내를 그대로 보여준다', async () => {
    const { user } = setup('/register');
    await fillRegister(user, 'test@mypin.dev', 'mypass1234', 'mypass1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다.');
    expect(getToken()).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: '가입하기' })).toBeEnabled());
  });
});
