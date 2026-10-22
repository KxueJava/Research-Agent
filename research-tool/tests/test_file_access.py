import os
import tempfile
import unittest
import httpx
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from research_tool.api.file_manage import router


class FileAccessTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router, prefix="/v1/file_tool")
        self.client = TestClient(app)

    def test_anonymous_preview_and_download_do_not_lookup_files(self):
        with patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id", new=AsyncMock(return_value=None)) as lookup:
            for operation in ("preview", "download"):
                response = self.client.get(f"/v1/file_tool/{operation}/other-session/private.html")
                self.assertEqual(401, response.status_code)
            lookup.assert_not_awaited()

    def test_register_cannot_be_called_with_user_supplied_local_path(self):
        response = self.client.post("/v1/file_tool/register_file", json={
            "requestId": "s", "fileName": "private.html", "localPath": "C:/private.html"})
        self.assertEqual(403, response.status_code)

    def test_anonymous_file_metadata_is_denied(self):
        response = self.client.post("/v1/file_tool/get_file_list", json={"requestId": "other-session"})
        self.assertEqual(401, response.status_code)

    def test_cookie_reuses_authorization_and_checks_requested_scope(self):
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
            f.write("<h1>Owned</h1>"); path=f.name
        try:
            response=lambda url,**kwargs: httpx.Response(200 if url.endswith("/identity") else 204)
            with patch("research_tool.api.file_access.httpx.AsyncClient.get",new=AsyncMock(side_effect=response)) as authorize, \
                 patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=SimpleNamespace(file_path=path,request_id="owned"))):
                result=self.client.get("/v1/file_tool/preview/owned/demo.html",headers={"Cookie":"research_file_access=test-access"})
                self.assertEqual(200,result.status_code)
                self.assertEqual("private, no-store",result.headers["cache-control"])
                self.assertEqual({"requestId":"owned"},authorize.call_args.kwargs["params"])
                self.assertEqual("Bearer test-access",authorize.call_args.kwargs["headers"]["Authorization"])
        finally:
            os.remove(path)

    def test_foreign_deleted_and_expired_files_fail_closed(self):
        with tempfile.NamedTemporaryFile() as f:
            for status,expected in ((404,404),(401,401),(500,503)):
                response=lambda url,**kwargs: httpx.Response(200 if url.endswith("/identity") else status)
                with patch("research_tool.api.file_access.httpx.AsyncClient.get",new=AsyncMock(side_effect=response)), \
                     patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=SimpleNamespace(file_path=f.name,request_id="foreign"))):
                    result=self.client.get("/v1/file_tool/preview/foreign/demo.html",headers={"Authorization":"Bearer access"})
                    self.assertEqual(expected,result.status_code)

    def test_internal_token_is_required_and_compared(self):
        with patch.dict(os.environ,{"RESEARCH_FILE_SERVICE_TOKEN":"server-only"}), \
             patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=None)):
            self.assertEqual(401,self.client.get("/v1/file_tool/preview/s/x.html",headers={"X-Research-File-Service":"wrong"}).status_code)
            self.assertEqual(404,self.client.get("/v1/file_tool/preview/s/x.html",headers={"X-Research-File-Service":"server-only"}).status_code)

    def test_modified_immutable_html_is_not_served_as_an_old_version(self):
        with tempfile.NamedTemporaryFile("w",suffix=".html",delete=False) as f:
            f.write("Changed");path=f.name
        try:
            with patch("research_tool.api.file_manage.authorize_file_scope",new=AsyncMock()), \
                 patch("research_tool.api.file_manage.require_file_reader",new=AsyncMock()), \
                 patch("research_tool.api.file_manage.authorize_file_record",new=AsyncMock()), \
                 patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=SimpleNamespace(file_path=path,request_id="s"))):
                result=self.client.get("/v1/file_tool/preview/s/.ui-surfaces/html-demo/"+"a"*64+".html")
                self.assertEqual(409,result.status_code)
        finally:
            os.remove(path)

    def test_legacy_ambiguous_file_id_cannot_escape_authorized_scope(self):
        async def authorize(url,headers,params=None):
            if url.endswith("/identity"):
                return httpx.Response(200)
            return httpx.Response(204 if params["requestId"]=="owned" else 404)
        with tempfile.NamedTemporaryFile("w",delete=False) as f:
            f.write("Private");path=f.name
        try:
            with patch("research_tool.api.file_access.httpx.AsyncClient.get",new=AsyncMock(side_effect=authorize)), \
                 patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=SimpleNamespace(file_path=path,request_id="owned-victim"))):
                for operation in ("preview","download"):
                    result=self.client.get(f"/v1/file_tool/{operation}/owned/-victimdemo.html",headers={"Authorization":"Bearer access"})
                    self.assertEqual(404,result.status_code)
        finally:
            os.remove(path)

    def test_explicit_knowledge_always_checks_active_reference_even_with_same_named_session(self):
        with tempfile.NamedTemporaryFile() as f:
            response=lambda url,**kwargs: httpx.Response(200 if url.endswith("/identity") else 204)
            with patch("research_tool.api.file_access.httpx.AsyncClient.get",new=AsyncMock(side_effect=response)), \
                 patch("research_tool.api.file_manage.FileInfoOp.get_by_file_id",new=AsyncMock(return_value=SimpleNamespace(file_path=f.name,request_id="a"*32,resource_kind="knowledge"))), \
                 patch("research_tool.api.knowledge_file_access.is_shared_knowledge_file",return_value=False) as shared:
                result=self.client.get("/v1/file_tool/preview/"+"a"*32+"/deleted.pdf",headers={"Authorization":"Bearer access"})
                self.assertEqual(404,result.status_code);shared.assert_called_once()
