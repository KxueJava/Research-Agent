import os
import unittest
from unittest.mock import patch
import httpx
from sqlalchemy import create_engine
from sqlmodel import SQLModel,Session
from research_tool.db.file_table import FileInfo
from research_tool.api.knowledge_download import knowledge_download_headers

class KnowledgeDownloadTest(unittest.TestCase):
    def check(self,kind,classification="unmapped"):
        engine=create_engine("sqlite://")
        try:
            SQLModel.metadata.create_all(engine)
            scope="a"*32
            with Session(engine) as db:
                db.add(FileInfo(filename="image.png",file_id="fixture",file_path="unused",request_id=scope,status=1,resource_kind=kind));db.commit()
            with patch("research_tool.db.db_engine.engine",engine), \
                 patch("research_tool.api.knowledge_file_access.is_shared_knowledge_file",return_value=True), \
                 patch("httpx.Client.get",return_value=httpx.Response(200,json={"kind":classification})), \
                 patch.dict(os.environ,{"RESEARCH_FILE_SERVICE_TOKEN":"test-key","FILE_SERVER_URL":"http://127.0.0.1:1601/v1/file_tool"}):
                return knowledge_download_headers(f"http://127.0.0.1:1601/v1/file_tool/download/{scope}/image.png")
        finally:
            engine.dispose()

    def test_legacy_reference_cannot_download_private_or_deleted_scope(self):
        with self.assertRaises(PermissionError):
            self.check("legacy","conversation")

    def test_only_genuinely_unmapped_legacy_reference_gets_internal_credentials(self):
        self.assertEqual({"X-Research-File-Service":"test-key"},self.check("legacy"))

    def test_external_host_never_gets_internal_credentials(self):
        self.assertEqual({},knowledge_download_headers("https://evil.example/v1/file_tool/download/s/image.png"))
