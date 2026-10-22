"""Deletion during download/embedding must fence subsequent ingestion writes."""
import tempfile
import asyncio
import threading
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, BackgroundTasks
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from research_tool.tool.mrag.api.routes import document
from research_tool.tool.mrag.document import processor as processor_module
from research_tool.tool.mrag.storage import store_factory
from research_tool.tool.mrag.storage.models.kb_model import KBModel


class IngestionDeletionRaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.engine = create_engine("sqlite:///" + str(Path(self.temp.name) / "metadata.db"),
                                    connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        self.patch(store_factory, "_sqlite_engine", self.engine)
        self.kbs = store_factory.get_kb_store()
        self.files = store_factory.get_kb_file_store()
        self.docs = store_factory.get_kb_doc_store()
        self.kbs.create_kb(KBModel(kb_id="kb-a", kb_name="A", deleted=0, create_time=datetime.now()))
        for name, value in (("get_kb_store", self.kbs), ("get_kb_file_store", self.files),
                            ("get_kb_doc_store", self.docs)):
            self.patch(document, name, value, return_value=True)
        self.vectors = MagicMock()
        self.points = []
        self.vectors.delete_by_file_ids.side_effect = lambda kb, ids: self.remove_points(ids)
        self.vectors.delete_text_by_kb_id.side_effect = lambda kb: self.remove_points(None)
        self.vectors.delete_image_by_kb_id.return_value = True
        self.vectors.delete_page_by_kb_id.return_value = True
        self.vectors.add_text_chunks.side_effect = lambda chunks: self.points.extend(chunks) or True
        self.patch(document, "VectorStore", self.vectors, return_value=True)
        app = FastAPI(); app.include_router(document.router, prefix="/v1")
        self.client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        self.entered = threading.Event(); self.release = threading.Event()
        self.addCleanup(self.release.set)

    def patch(self, target, name, value, return_value=False):
        patched = patch.object(target, name, **({"return_value": value} if return_value else {"new": value}))
        patched.start(); self.addCleanup(patched.stop)

    def remove_points(self, ids):
        self.points[:] = [point for point in self.points if ids is not None and point["file_id"] not in ids]
        return True

    def paused(self):
        self.entered.set()
        if not self.release.wait(5): raise TimeoutError("test worker not released")

    def start_ingestion(self, download):
        self.patch(document.download_utils, "download_file", download)
        thread = threading.Thread(target=document.add_file, args=("demo.md", "https://offline.invalid/demo", "kb-a"))
        thread.start()
        self.addCleanup(lambda: thread.join(5))
        self.assertTrue(self.entered.wait(5), "worker did not reach test barrier")
        return thread

    def delete(self, whole_kb):
        if whole_kb:
            return self.client.post("/v1/documents/delete_knowledge_base", json={"kb_id": "kb-a"})
        file_id = self.files.list_kb_files("kb-a", 1, 10)[0].file_id
        return self.client.post("/v1/documents/delete_files", json={"kb_id": "kb-a", "file_ids": [file_id]})

    def test_deleted_kb_during_download_does_not_start_processor(self):
        mocked_processor = MagicMock()
        self.patch(document, "DocumentProcessor", mocked_processor)
        def download(url, path):
            self.paused(); Path(path).write_text("content", encoding="utf-8")
        thread = self.start_ingestion(download)
        self.assertEqual(200, self.delete(True).status_code)
        self.release.set(); thread.join(5)
        self.assertFalse(thread.is_alive())
        mocked_processor.assert_not_called()
        self.assertEqual([], self.files.list_kb_files("kb-a", 1, 10))

    def test_deletion_during_embedding_blocks_vectors_and_canonical_text(self):
        for whole_kb in (False, True):
            with self.subTest(whole_kb=whole_kb):
                if self.kbs.get_kb("kb-a") is None:
                    self.client.post("/v1/documents/create_knowledge_base", json={"kb_id": "kb-a", "kb_name": "A"})
                self.entered.clear(); self.release.clear()
                def make_processor(kb, file_id, work, path, url, **kwargs):
                    obj = processor_module.DocumentProcessor.__new__(processor_module.DocumentProcessor)
                    obj._kb_id = kb; obj._uid = file_id; obj._file_path = path
                    obj._file_url = url; obj._filename = "demo.md"
                    obj._ingestion_guard = kwargs.get("ingestion_guard")
                    obj._parser = SimpleNamespace(parsed_text=lambda: "body", parsed_images=lambda: [], parsed_pages=lambda: [])
                    obj._vector_store = self.vectors
                    obj._text_embedding = SimpleNamespace(encode_text_batch=lambda texts: self.paused() or [[1.0] for _ in texts])
                    obj._bm25_embedding = SimpleNamespace(encode_text_batch=lambda texts: [{} for _ in texts])
                    return obj
                self.patch(document, "DocumentProcessor", make_processor)
                self.patch(processor_module, "get_text_splitter", lambda **kwargs: SimpleNamespace(split=lambda **kwargs: ["body"]))
                self.patch(processor_module, "get_kb_doc_store", self.docs, return_value=True)
                thread = self.start_ingestion(lambda url, path: Path(path).write_text("body", encoding="utf-8"))
                file_id = self.files.list_kb_files("kb-a", 1, 10)[0].file_id
                self.assertEqual(200, self.delete(whole_kb).status_code)
                self.release.set(); thread.join(5)
                self.assertFalse(thread.is_alive())
                self.assertEqual([], self.points)
                self.assertIsNone(self.docs.get_canonical_doc("kb-a", file_id))
                self.assertEqual([], self.files.list_kb_files("kb-a", 1, 10))

    def test_queued_task_from_deleted_generation_cannot_run_in_recreated_kb(self):
        tasks = BackgroundTasks()
        asyncio.run(document.add_files(document.AddFilesRequest(kb_id="kb-a", files=[
            document.File(filename="old.md", file_url="https://offline.invalid/old")]), tasks))
        self.assertEqual(200, self.delete(True).status_code)
        created = self.client.post("/v1/documents/create_knowledge_base", json={"kb_id": "kb-a", "kb_name": "A"})
        self.assertEqual(200, created.status_code)
        downloader = MagicMock()
        self.patch(document.download_utils, "download_file", downloader)
        asyncio.run(tasks())
        downloader.assert_not_called()
        self.assertEqual([], self.files.list_kb_files("kb-a", 1, 10))

    def test_web_crawl_result_cannot_start_processing_after_kb_deleted(self):
        from research_tool.tool.mrag.utils import crawl_utils
        mocked_processor = MagicMock(); self.patch(document, "DocumentProcessor", mocked_processor)
        def crawl(url): self.paused(); return "# body"
        self.patch(crawl_utils, "crawl", crawl)
        thread = threading.Thread(target=document.add_web_url, args=("https://offline.invalid/page", "kb-a"))
        thread.start(); self.addCleanup(lambda: thread.join(5))
        self.assertTrue(self.entered.wait(5))
        self.assertEqual(200, self.delete(True).status_code)
        self.release.set(); thread.join(5)
        self.assertFalse(thread.is_alive()); mocked_processor.assert_not_called()
        self.assertEqual([], self.files.list_kb_files("kb-a", 1, 10))

    def test_canonical_text_is_fenced_even_if_deleted_after_vector_stage(self):
        lifecycle = store_factory.get_ingestion_lifecycle()
        obj = processor_module.DocumentProcessor.__new__(processor_module.DocumentProcessor)
        obj._kb_id = "kb-a"; obj._uid = "file-a"; obj._filename = "demo.md"
        obj._file_url = "https://offline.invalid/demo"
        obj._parser = SimpleNamespace(parsed_text=lambda: "body")
        obj._ingestion_guard = lifecycle.guard("kb-a", "file-a")
        self.patch(processor_module, "get_kb_doc_store", self.docs, return_value=True)
        self.assertEqual(200, self.delete(True).status_code)
        from research_tool.tool.mrag.storage.ingestion_lifecycle import IngestionCancelled
        with self.assertRaises(IngestionCancelled): obj._persist_canonical_full_text()
        self.assertIsNone(self.docs.get_canonical_doc("kb-a", "file-a"))

    def test_normal_ingestion_still_persists_success(self):
        class Processor:
            def __init__(self, kb, file_id, work, path, url, ingestion_guard=None):
                self.guard = ingestion_guard
            def process(self): self.guard.check()
        self.patch(document, "DocumentProcessor", Processor)
        self.patch(document.download_utils, "download_file", lambda url, path: Path(path).write_text("body"))
        document.add_file("demo.md", "https://offline.invalid/demo", "kb-a")
        records = self.files.list_kb_files("kb-a", 1, 10)
        self.assertEqual(1, len(records)); self.assertEqual("SUCCESS", records[0].file_status)

    def test_cleanup_failure_cancels_pending_ingestion_but_allows_delete_retry(self):
        mocked_processor = MagicMock(); self.patch(document, "DocumentProcessor", mocked_processor)
        def download(url, path): self.paused(); Path(path).write_text("content")
        thread = self.start_ingestion(download)
        self.vectors.delete_text_by_kb_id.side_effect = RuntimeError("offline")
        self.assertEqual(503, self.delete(True).status_code)
        self.assertEqual(409, self.client.post("/v1/documents/add_files", json={
            "kb_id": "kb-a", "files": []}).status_code)
        self.release.set(); thread.join(5); mocked_processor.assert_not_called()
        self.assertEqual(1, len(self.files.list_kb_files("kb-a", 1, 10)))
        self.vectors.delete_text_by_kb_id.side_effect = lambda kb: self.remove_points(None)
        self.assertEqual(200, self.delete(True).status_code)
        self.assertEqual([], self.files.list_kb_files("kb-a", 1, 10))

    def test_stale_deletion_retry_cannot_cancel_recreated_kb(self):
        self.kbs.delete_kb(KBModel(kb_id="kb-a"))
        lifecycle = store_factory.get_ingestion_lifecycle()
        original_delete = lifecycle.deleting
        def recreate_before_lock(*args, **kwargs):
            lifecycle.create("kb-a", lambda: self.kbs.create_kb(KBModel(
                kb_id="kb-a", kb_name="new generation", deleted=0, create_time=datetime.now())))
            return original_delete(*args, **kwargs)
        self.patch(lifecycle, "deleting", recreate_before_lock)
        self.patch(document, "get_ingestion_lifecycle", lifecycle, return_value=True)
        response = self.delete(True)
        self.assertEqual(503, response.status_code)
        self.vectors.delete_text_by_kb_id.assert_not_called()
        self.assertIsNotNone(self.kbs.get_kb("kb-a"))
        lifecycle.guard("kb-a", "new-file").check()

    def test_visual_upsert_result_controls_ingestion_status(self):
        from PIL import Image
        from research_tool.tool.mrag.enums.task_status_enums import TaskStatusEnum
        asset = str(Path(self.temp.name) / "visual.png")
        Image.new("RGB", (8, 8)).save(asset)
        captured = []
        for kind, success in (("image", False), ("page", False), ("image", True), ("page", True)):
            with self.subTest(kind=kind, success=success):
                self.vectors.add_image_chunks.return_value = success if kind == "image" else True
                self.vectors.add_page_chunks.return_value = success if kind == "page" else True
                def make_processor(kb, file_id, work, path, url, **kwargs):
                    captured.append(file_id)
                    obj = processor_module.DocumentProcessor.__new__(processor_module.DocumentProcessor)
                    obj._kb_id = kb; obj._uid = file_id; obj._file_path = path
                    obj._file_url = url; obj._filename = "demo.md"
                    obj._ingestion_guard = kwargs["ingestion_guard"]
                    obj._image_vector_enabled = True
                    obj._vector_store = self.vectors
                    obj._image_embedding = SimpleNamespace(encode_image_batch=lambda images: [[1.0] for _ in images])
                    obj._parser = SimpleNamespace(parsed_text=lambda: "", images_dir=self.temp.name,
                        pages_dir=self.temp.name, parsed_images=lambda: [asset] if kind == "image" else [],
                        parsed_pages=lambda: [asset] if kind == "page" else [])
                    obj._get_uploaded_asset_url = lambda *args: "https://offline.invalid/visual.png"
                    obj._build_visual_text_chunks = lambda *args, **kwargs: []
                    obj._lightrag_process = lambda: None
                    return obj
                with patch.object(document, "DocumentProcessor", make_processor), patch.object(
                    document.download_utils, "download_file", lambda url, path: Path(path).write_text("body")):
                    document.add_file("demo.md", "https://offline.invalid/demo", "kb-a")
                record = self.files.get_file("kb-a", captured[-1])
                self.assertEqual(TaskStatusEnum.SUCCESS.value if success else TaskStatusEnum.FAILED.value, record.file_status)
                if not success:
                    self.assertIn(kind, record.task_status["error_message"])


if __name__ == "__main__": unittest.main()
