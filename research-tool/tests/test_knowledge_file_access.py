import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch,Mock
from sqlalchemy import create_engine
from research_tool.api.knowledge_file_access import is_shared_knowledge_file,_file_path
from research_tool.db.file_table_op import FileDB
from research_tool.tool.mrag.storage.kb_file_store_sqlite_impl import KBFileSQLite,KBFileSQLModel
from research_tool.tool.mrag.storage.kb_doc_store_sqlite_impl import Base as DocBase

class KnowledgeFileAccessTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.engine=create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        self.store=KBFileSQLite(self.engine);DocBase.metadata.create_all(self.engine)
        self.kbs=Mock();self.kbs.get_kb.return_value=SimpleNamespace(kb_id="kb")
        self.scope="a"*32;self.name=self.scope+"_report.pdf"
        path=Path(self.temp.name)/self.scope/self.name;path.parent.mkdir();path.write_bytes(b"test")
        self.record=SimpleNamespace(request_id=self.scope,filename=self.name,file_path=str(path),resource_kind="knowledge",description=json.dumps({"uploadDocumentId":self.scope}))
        for target,value in (("research_tool.tool.mrag.storage.store_factory.get_kb_file_store",self.store),("research_tool.tool.mrag.storage.store_factory.get_kb_store",self.kbs)):
            patcher=patch(target,return_value=value);patcher.start();self.addCleanup(patcher.stop)
        patcher=patch.object(FileDB,"_work_dir",self.temp.name);patcher.start();self.addCleanup(patcher.stop)

    def source(self,deleted=0,url=None):
        now=datetime.now()
        with self.store._get_session() as db:
            db.add(KBFileSQLModel(kb_id="kb",file_id="b"*32,file_url=url or f"http://127.0.0.1:1601/v1/file_tool/download/{self.scope}/{self.name}",title="report",file_ext=".pdf",source_type="file",task_status={},file_status="completed",doc_count=0,create_time=now,modify_time=now,deleted=deleted));db.commit()

    def test_staged_knowledge_upload_and_active_reference_are_shared(self):
        self.assertTrue(is_shared_knowledge_file(self.record));self.source()
        self.assertTrue(is_shared_knowledge_file(self.record))

    def test_deleted_document_or_knowledge_base_is_denied(self):
        self.source(deleted=1);self.assertFalse(is_shared_knowledge_file(self.record))
        self.kbs.get_kb.return_value=None;self.assertFalse(is_shared_knowledge_file(self.record))

    def test_ordinary_conversation_is_not_promoted_by_a_knowledge_reference(self):
        self.source();self.record.resource_kind="session"
        self.assertFalse(is_shared_knowledge_file(self.record))

    def test_legacy_original_requires_exact_active_reference(self):
        self.record.resource_kind="legacy";self.assertFalse(is_shared_knowledge_file(self.record))
        self.source();self.assertTrue(is_shared_knowledge_file(self.record))

    def test_foreign_origins_and_query_variants_are_not_resource_references(self):
        self.assertEqual("",_file_path("https://evil.example/v1/file_tool/download/s/x"))
        self.assertEqual("",_file_path("http://127.0.0.1:1601/v1/file_tool/download/s/x?anything=1"))
