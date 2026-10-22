"""Positive KB association for the existing logged-in shared knowledge workspace.

Never treat ordinary conversation files as KB assets. Legacy matching is limited
to locally stored, UUID-scoped MRAG naming and exact document/asset URLs.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit, unquote


def _file_path(url):
    parsed=urlsplit(str(url or ""))
    if parsed.query or parsed.fragment:
        return ""
    if parsed.scheme and (parsed.scheme not in ("http","https") or not parsed.netloc):
        return ""
    bases=[os.environ.get("FILE_SERVER_INTERNAL_URL","http://127.0.0.1:1601/v1/file_tool"),os.environ.get("FILE_SERVER_URL","http://127.0.0.1:1601/v1/file_tool")]
    bases+=os.environ.get("RESEARCH_FILE_ALLOWED_ORIGINS","http://localhost:3001,http://127.0.0.1:3001").split(",")
    origins={(urlsplit(x).scheme,urlsplit(x).netloc) for x in bases}
    if parsed.netloc and (parsed.scheme,parsed.netloc) not in origins:
        return ""
    path=unquote(parsed.path)
    if path.startswith("/tool/"):
        path=path[5:]
    return path.replace("/preview/", "/download/", 1) if path.startswith("/v1/file_tool/") else ""


def is_shared_knowledge_file(record):
    kind=getattr(record,"resource_kind","legacy")
    if kind not in ("knowledge", "legacy"):
        return False
    from research_tool.db.file_table_op import FileDB
    scope=str(record.request_id or "")
    if not re.fullmatch(r"[a-f0-9]{32}",scope):
        return False
    try:
        if not Path(record.file_path).resolve().is_relative_to(Path(FileDB._work_dir).resolve()/scope):
            return False
    except (OSError,ValueError):
        return False
    from research_tool.tool.mrag.storage.store_factory import get_kb_file_store, get_kb_store
    from research_tool.tool.mrag.storage.kb_file_store_sqlite_impl import KBFileSQLModel
    from research_tool.tool.mrag.storage.kb_doc_store_sqlite_impl import KBDocSQLModel
    files=get_kb_file_store();kb_store=get_kb_store()
    target=f"/v1/file_tool/download/{scope}/{record.filename}"
    try:
        binding=json.loads(record.description or "{}") if kind=="knowledge" else {}
    except (TypeError,ValueError):
        return False
    with files._get_session() as db:
        if binding.get("kbId") and binding.get("fileId"):
            return bool(files.get_file(binding["kbId"],binding["fileId"]) and kb_store.get_kb(binding["kbId"]))
        candidates=db.query(KBFileSQLModel).filter(KBFileSQLModel.file_url.contains(scope)).all()
        linked=[f for f in candidates if _file_path(f.file_url)==target]
        if linked:
            return any(f.deleted==0 and kb_store.get_kb(f.kb_id) for f in linked)
        # New staged uploads are shared after login, just like the existing KB.
        if kind=="knowledge" and binding.get("uploadDocumentId")==scope:
            return True
        # Legacy page/image uploads use a random scope and a parser file-id prefix.
        prefix=record.filename.split("_",1)[0]
        if not re.fullmatch(r"[a-f0-9]{32}",prefix):
            return False
        candidates=db.query(KBFileSQLModel).filter(KBFileSQLModel.file_id==prefix,KBFileSQLModel.deleted==0).all()
        for source in candidates:
            if not kb_store.get_kb(source.kb_id):
                continue
            documents=db.query(KBDocSQLModel).filter(KBDocSQLModel.kb_id==source.kb_id,KBDocSQLModel.file_id==prefix,KBDocSQLModel.deleted==0).all()
            for document in documents:
                # Parse actual Markdown image references, not arbitrary substring text.
                urls=re.findall(r'!\[[^\]]*\]\(([^\s)]+)',document.text or "")
                if any(_file_path(url)==target for url in urls):
                    return True
    return False
