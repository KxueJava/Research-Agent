"""Internal credentials are restricted to positively identified shared KB resources."""
import os
from urllib.parse import urlsplit,unquote

def knowledge_download_headers(url):
    parsed=urlsplit(url)
    bases=[os.environ.get("FILE_SERVER_INTERNAL_URL","http://127.0.0.1:1601/v1/file_tool"),os.environ.get("FILE_SERVER_URL","http://127.0.0.1:1601/v1/file_tool")]
    if (parsed.scheme,parsed.netloc) not in {(urlsplit(x).scheme,urlsplit(x).netloc) for x in bases}:
        return {}
    path=unquote(parsed.path)
    prefix="/v1/file_tool/"
    if not path.startswith(prefix) or parsed.query or parsed.fragment:
        return {}
    operation,scope,name=path[len(prefix):].split("/",2)
    if operation not in ("preview","download"):
        return {}
    from sqlmodel import Session,select
    from research_tool.db.db_engine import engine
    from research_tool.db.file_table import FileInfo
    from research_tool.api.knowledge_file_access import is_shared_knowledge_file
    with Session(engine) as db:
        record=db.exec(select(FileInfo).where(FileInfo.request_id==scope,FileInfo.filename==name,FileInfo.status==1)).first()
        if record is None or not is_shared_knowledge_file(record):
            raise PermissionError("Local file is not an active shared knowledge resource")
        if record.resource_kind=="legacy":
            # A KB URL must never turn a known private/deleted conversation scope
            # into an internal download. The callback is fixed and server-authenticated.
            import httpx
            base=os.environ.get("RESEARCH_FILE_AUTH_BASE_URL","http://127.0.0.1:8101").rstrip("/")
            with httpx.Client(timeout=5,trust_env=False,follow_redirects=False) as client:
                classification=client.get(f"{base}/api/agent/file/scope-kind",params={"scope":scope},headers={"X-Research-File-Service":os.environ.get("RESEARCH_FILE_SERVICE_TOKEN","")})
            if classification.status_code!=200 or classification.json().get("kind")!="unmapped":
                raise PermissionError("Legacy resource belongs to a private or deleted conversation")
    token=os.environ.get("RESEARCH_FILE_SERVICE_TOKEN","")
    if not token:
        raise PermissionError("Trusted file service credential is not configured")
    return {"X-Research-File-Service":token}
