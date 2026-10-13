"""Offline deletion regressions: SQLite metadata and injected vector failures."""
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from research_tool.tool.mrag.api.routes import document
from research_tool.tool.mrag.storage.kb_store_sqlite_impl import KBStoreSQLite
from research_tool.tool.mrag.storage.models.kb_model import KBModel
from research_tool.tool.mrag.storage.ingestion_lifecycle import IngestionLifecycle


class DeletionConsistencyTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.engine = create_engine(
            "sqlite:///" + str(Path(self.directory.name) / "metadata.db"),
            connect_args={"check_same_thread": False},
        )
        self.addCleanup(self.engine.dispose)
        self.kb = KBStoreSQLite(self.engine)
        self.kb.create_kb(KBModel(kb_id="kb-a", deleted=0, create_time=datetime.now()))
        lifecycle_patch = patch.object(document, "get_ingestion_lifecycle", return_value=
                                       IngestionLifecycle(self.engine, self.kb.get_kb))
        lifecycle_patch.start()
        self.addCleanup(lifecycle_patch.stop)
        self.files = MagicMock()
        self.files.delete_by_kb_id.return_value = 2
        self.files.delete_by_file_ids.return_value = 1
        self.docs = MagicMock()
        self.docs.delete_by_kb_id.return_value = 2
        self.docs.delete_by_file_ids.return_value = 1
        self.vectors = MagicMock()
        for name in ("delete_text_by_kb_id", "delete_image_by_kb_id",
                     "delete_page_by_kb_id", "delete_by_file_ids"):
            getattr(self.vectors, name).return_value = True
        for name, value in (("get_kb_store", self.kb), ("get_kb_file_store", self.files),
                            ("get_kb_doc_store", self.docs), ("VectorStore", self.vectors)):
            mock_patch = patch.object(document, name, return_value=value)
            mock_patch.start()
            self.addCleanup(mock_patch.stop)
        app = FastAPI()
        app.include_router(document.router, prefix="/v1")
        self.client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def delete_kb(self):
        return self.client.post("/v1/documents/delete_knowledge_base", json={"kb_id": "kb-a"})

    def delete_files(self, ids=None):
        return self.client.post("/v1/documents/delete_files", json={
            "kb_id": "kb-a", "file_ids": ids if ids is not None else ["file-a"]})

    def test_each_vector_failure_preserves_kb_metadata_for_retry(self):
        for name in ("delete_text_by_kb_id", "delete_image_by_kb_id", "delete_page_by_kb_id"):
            with self.subTest(collection=name):
                operation = getattr(self.vectors, name)
                operation.return_value = False
                response = self.delete_kb()
                self.assertEqual(503, response.status_code)
                self.assertEqual(["kb-a"], [kb.kb_id for kb in self.kb.get_kbs(1, 10)])
                self.files.delete_by_kb_id.assert_not_called()
                self.docs.delete_by_kb_id.assert_not_called()
                operation.return_value = True
        self.assertEqual(200, self.delete_kb().status_code)
        self.assertEqual([], self.kb.get_kbs(1, 10))

    def test_vector_exception_returns_retryable_error_without_internal_detail(self):
        self.vectors.delete_page_by_kb_id.side_effect = RuntimeError("secret-provider-detail")
        response = self.delete_kb()
        self.assertEqual(503, response.status_code)
        self.assertNotIn("secret-provider-detail", response.text)
        self.assertEqual(1, len(self.kb.get_kbs(1, 10)))

    def test_metadata_failure_preserves_kb_and_retry_completes(self):
        self.docs.delete_by_kb_id.side_effect = RuntimeError("sqlite unavailable")
        self.assertEqual(503, self.delete_kb().status_code)
        self.assertEqual(1, len(self.kb.get_kbs(1, 10)))
        self.files.delete_by_kb_id.assert_not_called()
        self.docs.delete_by_kb_id.side_effect = None
        self.assertEqual(200, self.delete_kb().status_code)

    def test_completed_kb_deletion_can_be_repeated(self):
        self.assertEqual(200, self.delete_kb().status_code)
        self.assertEqual(200, self.delete_kb().status_code)
        self.assertEqual(2, self.vectors.delete_page_by_kb_id.call_count)

    def test_final_metadata_failure_keeps_kb_visible(self):
        with patch.object(self.kb, "delete_kb", return_value=False):
            self.assertEqual(503, self.delete_kb().status_code)
        self.assertEqual(1, len(self.kb.get_kbs(1, 10)))
        self.assertEqual(200, self.delete_kb().status_code)

    def test_legacy_soft_deleted_kb_can_still_cleanup_vectors(self):
        self.kb.delete_kb(KBModel(kb_id="kb-a"))
        self.assertEqual(200, self.delete_kb().status_code)
        self.vectors.delete_text_by_kb_id.assert_called_once_with("kb-a")

    def test_recreated_kb_with_same_id_is_deleted_instead_of_old_tombstone(self):
        self.kb.delete_kb(KBModel(kb_id="kb-a"))
        self.kb.create_kb(KBModel(kb_id="kb-a", kb_name="recreated", deleted=0,
                                  create_time=datetime.now()))
        self.assertEqual(200, self.delete_kb().status_code)
        self.assertEqual([], self.kb.get_kbs(1, 10))

    def test_unknown_kb_returns_404_without_vector_calls(self):
        response = self.client.post("/v1/documents/delete_knowledge_base", json={"kb_id": "unknown"})
        self.assertEqual(404, response.status_code)
        self.vectors.delete_text_by_kb_id.assert_not_called()

    def test_file_vector_failure_keeps_metadata_and_retry_succeeds(self):
        self.vectors.delete_by_file_ids.return_value = False
        self.assertEqual(503, self.delete_files().status_code)
        self.files.delete_by_file_ids.assert_not_called()
        self.docs.delete_by_file_ids.assert_not_called()
        self.vectors.delete_by_file_ids.return_value = True
        self.assertEqual(200, self.delete_files().status_code)

    def test_file_doc_failure_keeps_file_record_for_retry(self):
        self.docs.delete_by_file_ids.side_effect = RuntimeError("sqlite unavailable")
        self.assertEqual(503, self.delete_files().status_code)
        self.files.delete_by_file_ids.assert_not_called()
        self.docs.delete_by_file_ids.side_effect = None
        self.assertEqual(200, self.delete_files().status_code)

    def test_file_vector_none_or_exception_is_not_success(self):
        self.vectors.delete_by_file_ids.return_value = None
        self.assertEqual(503, self.delete_files().status_code)
        self.vectors.delete_by_file_ids.side_effect = OSError("connection failed")
        self.assertEqual(503, self.delete_files().status_code)
        self.files.delete_by_file_ids.assert_not_called()

    def test_empty_or_blank_identifiers_are_rejected(self):
        for payload in ({"kb_id": "kb-a", "file_ids": []},
                        {"kb_id": " ", "file_ids": ["file-a"]},
                        {"kb_id": "kb-a", "file_ids": [" "]}):
            with self.subTest(payload=payload):
                response = self.client.post("/v1/documents/delete_files", json=payload)
                self.assertEqual(400, response.status_code)
        self.vectors.delete_by_file_ids.assert_not_called()


if __name__ == "__main__":
    unittest.main()
