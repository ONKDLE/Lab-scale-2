# 마이핀 프론트엔드 (React + Vite + TypeScript)

백엔드(FastAPI)와 연결된 가계부 화면입니다. (9주차 거래 목록 + 10주차 로그인·카테고리·취소/복구·보관)

## 화면과 주소
| 주소 | 화면 | 로그인 |
|---|---|---|
| `/login`, `/register` | 로그인, 회원가입 (가입하면 바로 로그인) | 불필요 |
| `/` | 거래 내역: 상태 탭, 가맹점 검색, 페이지 번호 (페이지·상태·검색어가 주소창에 반영됨) | 필요 |
| `/categories` | 카테고리 목록: 카드마다 거래 건수와 합계, 보관된 카테고리는 "보관됨" | 필요 |
| `/categories/번호` | 카테고리 상세: 요약 + 거래 목록, 거래 **취소 ↔ 복구**, 카테고리 **보관 ↔ 보관 해제** | 필요 |

- 로그인하지 않고 주소를 열면 로그인 화면으로 가고, 로그인하면 열려던 화면으로 돌아옵니다. (직접 로그아웃한 뒤에는 돌아가지 않음)
- 로그인은 새로고침해도 유지됩니다. 사용 중에 토큰이 만료되면 알림과 함께 로그인 화면으로 보냅니다.
- 취소·복구·보관·해제는 확인 팝업을 거치고, 성공하면 건수·합계·뱃지·버튼 글자가 **새로고침 없이 바로** 바뀝니다.
- 보관된 카테고리의 거래는 버튼이 잠깁니다. (서버도 409로 막음)
- 다른 계정의 카테고리 주소를 열면 "카테고리를 찾을 수 없습니다"가 나옵니다.
- 불러오는 중(뼈대 화면), 결과 없음, 서버 오류(다시 시도), 서버 연결 실패를 각각 안내합니다.

## 실행 방법

준비물: **Node.js 18 이상** (`node -v`로 확인)

**1. 백엔드를 먼저 켭니다** (터미널 1, `mypin` 폴더에서)
```
..\venv\Scripts\python.exe -m pip install -r requirements.txt
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```
거래가 여러 건 있어야 페이지 나누기가 보이므로, 처음 한 번은 샘플 데이터를 넣어 주세요.
```
..\venv\Scripts\python.exe seed_demo_data.py
```

**2. 프론트엔드를 켭니다** (터미널 2, `mypin\frontend` 폴더에서)
```
npm install
npm run dev
```
브라우저에서 http://localhost:5173 을 열고 **시연 계정**으로 로그인하세요.

| 이메일 | 비밀번호 | 용도 |
|---|---|---|
| `test@mypin.dev` | `mypin1234` | 기본 계정 (샘플 거래가 들어 있음) |
| `other@mypin.dev` | `mypin1234` | 다른 계정 (권한 확인용) |

> PowerShell에서 "스크립트를 실행할 수 없습니다" 오류가 나면, 같은 터미널에서 먼저 아래를 입력하세요.
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`

## 주소 설정
백엔드 주소는 코드에 적혀 있지 않고 `.env.development`의 `VITE_API_BASE_URL` 한 곳에서만 관리합니다.

## 테스트 / 빌드
```
npm test          # 화면 자동 테스트 145건 (실제 서버 없이, 상태를 기억하는 가짜 서버로 실행)
npm run build     # 타입 검사 + 배포용 빌드
```

## 폴더 구조
```
frontend/
├── .env.development          # 백엔드 주소 (VITE_API_BASE_URL)
├── src/
│   ├── api/                  # 서버 호출: client.ts(토큰 첨부, 401 처리), auth, categories, transactions
│   ├── auth/                 # 로그인 상태(AuthContext), 로그인 보호(RequireAuth), 토큰 보관
│   ├── types/                # 응답 타입 (백엔드 schemas.py와 같은 모양)
│   ├── lib/                  # 주소창 쿼리스트링, 금액 계산, 비밀번호 규칙, 표시 형식
│   ├── hooks/                # 거래 목록 불러오기 등
│   ├── components/           # Layout(상단 메뉴), ConfirmModal(확인 팝업), Toast(알림), Pagination 등
│   ├── pages/                # Login, Register, TransactionList, CategoryList, CategoryDetail, NotFound
│   └── test/                 # 테스트 도구 (가짜 서버 fakeApi, renderApp)
```

## 문제 해결
| 증상 | 원인과 해결 |
|---|---|
| 로그인 화면이 계속 나옴 | 시연 계정은 **서버를 새로 켜야** 비밀번호가 준비됩니다. 백엔드를 `Ctrl + C`로 끄고 다시 켜세요. |
| "서버에 연결할 수 없습니다" | 백엔드(FastAPI)가 꺼져 있거나 주소가 다릅니다. 터미널 1과 `.env.development`를 확인하세요. |
| `Port 5173 is already in use` | 이미 켜진 화면 터미널이 있습니다. 그 터미널을 `Ctrl + C`로 끄세요. |
| 서버가 시작하자마자 꺼지고 `bcrypt`, `jwt` 같은 문구 | 새 패키지가 없어서입니다. `..\venv\Scripts\python.exe -m pip install -r requirements.txt` 를 먼저 하세요. |
| 로그인했는데 목록이 비어 있음 | 새로 가입한 계정은 데이터가 없습니다. 샘플은 `test@mypin.dev` 계정에 들어 있습니다. |
