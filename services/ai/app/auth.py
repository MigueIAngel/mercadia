"""Access-token verification with identity's JWKS (RS256), same rules as the Node services."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request

from .config import settings

ISSUER = "mercadia-identity"
AUDIENCE = "mercadia"

_jwks: jwt.PyJWKClient | None = None


def jwks() -> jwt.PyJWKClient:
    global _jwks
    if _jwks is None:
        # The key header matters when JWKS is reached through the gateway's `_svc` route.
        _jwks = jwt.PyJWKClient(
            settings().jwks_url,
            cache_keys=True,
            lifespan=3600,
            headers={"x-internal-key": settings().internal_key},
        )
    return _jwks


@dataclass
class User:
    id: str
    name: str
    roles: list[str]
    store_id: str | None
    token: str


def _verify(token: str) -> User:
    key = jwks().get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, key, algorithms=["RS256"], audience=AUDIENCE, issuer=ISSUER)
    return User(
        id=claims["sub"],
        name=claims.get("name", ""),
        roles=list(claims.get("roles", [])),
        store_id=claims.get("storeId"),
        token=token,
    )


async def optional_user(request: Request) -> User | None:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        return await asyncio.to_thread(_verify, header[7:])
    except Exception:
        return None


async def current_user(user: User | None = Depends(optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def require_role(role: str):
    async def dependency(user: User = Depends(current_user)) -> User:
        if role not in user.roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return dependency
