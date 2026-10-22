"""File reads reuse Java login/session ownership; local file registration is server-only."""
import hmac
import os
import re
import httpx
from fastapi import HTTPException, Request

FILE_COOKIE = "research_file_access"


def is_internal(request: Request) -> bool:
    expected = os.environ.get("RESEARCH_FILE_SERVICE_TOKEN", "")
    supplied = request.headers.get("X-Research-File-Service", "")
    return bool(expected and supplied and hmac.compare_digest(expected.encode(), supplied.encode()))


async def require_internal(request: Request):
    if not is_internal(request):
        raise HTTPException(403, "File mutation requires the trusted file service")


def _credentials(request: Request):
    token = request.headers.get("Authorization", "")
    if not token:
        # Credentialed file reads are same-site only, even if the legacy app CORS
        # middleware is permissive. Never reflect a cookie-authenticated response to a foreign origin.
        origin = request.headers.get("Origin")
        allowed = {x.strip() for x in os.environ.get("RESEARCH_FILE_ALLOWED_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001").split(",") if x.strip()}
        if request.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and origin not in allowed):
            raise HTTPException(403, "Cross-site file credentials rejected")
        cookie = request.cookies.get(FILE_COOKIE, "")
        token = f"Bearer {cookie}" if cookie else ""
    if not token.startswith("Bearer ") or not token[7:].strip():
        raise HTTPException(401, "Please sign in to access this file")
    return token


async def require_file_reader(request: Request):
    if is_internal(request) or getattr(request.state,"file_reader_verified",False):
        return
    token=_credentials(request)
    base=os.environ.get("RESEARCH_FILE_AUTH_BASE_URL", "http://127.0.0.1:8101").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5,trust_env=False,follow_redirects=False) as client:
            response=await client.get(f"{base}/api/agent/file/identity",headers={"Authorization":token})
    except httpx.HTTPError:
        raise HTTPException(503,"File authorization temporarily unavailable") from None
    if response.status_code!=200:
        raise HTTPException(401 if response.status_code==401 else 503,"File access unavailable")
    request.state.file_reader_verified=True


async def authorize_file_scope(request: Request, scope: str, allow_unmapped: bool = False):
    if is_internal(request):
        return
    token=_credentials(request)
    if not scope or len(scope) > 128:
        raise HTTPException(404, "File not found")
    cache=getattr(request.state,"file_scope_authorizations",{})
    status=cache.get(scope)
    if status==204:
        return
    if status==422:
        if allow_unmapped:
            return
        raise HTTPException(422,"Unmapped document storage scope")
    base = os.environ.get("RESEARCH_FILE_AUTH_BASE_URL", "http://127.0.0.1:8101").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5, trust_env=False, follow_redirects=False) as client:
            response = await client.get(f"{base}/api/agent/file/access",
                params={"requestId": scope}, headers={"Authorization": token})
    except httpx.HTTPError:
        raise HTTPException(503, "File authorization temporarily unavailable") from None
    if response.status_code==204:
        cache[scope]=204;request.state.file_scope_authorizations=cache
    else:
        # Only a distinct authenticated "not a conversation" response can enter
        # shared KB resolution. A foreign/deleted conversation's 404 never can.
        if response.status_code == 422 and re.fullmatch(r"[a-f0-9]{32}", scope):
            cache[scope]=422;request.state.file_scope_authorizations=cache
            if allow_unmapped:
                return
            raise HTTPException(422, "Unmapped document storage scope")
        status = 401 if response.status_code == 401 else 404 if response.status_code in (403, 404) else 503
        raise HTTPException(status, "File unavailable or access denied")


async def authorize_file_record(request: Request, record):
    if is_internal(request):
        return
    if getattr(record,"resource_kind",None)=="knowledge":
        await require_file_reader(request)
        from research_tool.api.knowledge_file_access import is_shared_knowledge_file
        import asyncio
        if not await asyncio.to_thread(is_shared_knowledge_file, record):
            raise HTTPException(404,"Knowledge resource unavailable")
        return
    try:
        await authorize_file_scope(request, record.request_id)
    except HTTPException as error:
        if error.status_code != 422:
            raise
        from research_tool.api.knowledge_file_access import is_shared_knowledge_file
        import asyncio
        if not await asyncio.to_thread(is_shared_knowledge_file, record):
            raise HTTPException(404, "File unavailable or access denied") from None
