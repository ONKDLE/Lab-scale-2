"""
"지금 요청한 사람이 누구인가"를 알아내는 공통 의존성.

로그인한 사용자의 토큰(Authorization: Bearer ...)에서 사용자 id를 꺼낸다.
토큰이 없거나, 만료됐거나, 변조됐거나, 계정이 사라졌으면 401을 돌려준다.

[개발용 예외] 환경변수 ALLOW_DEV_USER_HEADER=1 일 때만, 토큰 없이도
X-User-Id 헤더로 사용자를 흉내 낼 수 있다. (자동 테스트 전용이며 기본은 꺼져 있다.)
"""
import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.security import decode_access_token

DEFAULT_USER_ID = 1

# auto_error=False: 토큰이 없을 때의 에러 문구를 우리가 직접 정해서 돌려주기 위함
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _dev_user_id(request: Request) -> int:
    raw = request.headers.get("x-user-id")
    if raw is None:
        return DEFAULT_USER_ID
    try:
        return int(raw)
    except ValueError:
        raise unauthorized("X-User-Id 헤더 값이 올바르지 않습니다.")


def get_current_user_id(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> int:
    if token:
        user_id = decode_access_token(token)
        if user_id is None:
            raise unauthorized("로그인이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.")
    elif os.getenv("ALLOW_DEV_USER_HEADER") == "1":
        user_id = _dev_user_id(request)
    else:
        raise unauthorized("로그인이 필요합니다.")

    # 토큰은 유효해도 그 사이에 계정이 지워졌을 수 있다.
    if db.get(models.User, user_id) is None:
        raise unauthorized("존재하지 않는 계정입니다. 다시 로그인해 주세요.")
    return user_id
