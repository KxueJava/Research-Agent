"""Offline regression tests for ingestion download ownership and path isolation."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from research_tool.tool.mrag.storage.ingestion_lifecycle import IngestionLifecycle
from research_tool.tool.mrag.storage.models.kb_model import KBModel

from research_tool.tool.mrag.api.routes import document
from research_tool.tool.mrag.enums.task_status_enums import TaskStatusEnum


class MragDownloadPathsTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        engine = create_engine("sqlite:///" + str(Path(directory.name) / "metadata.db"))
        self.addCleanup(engine.dispose)
        self.lifecycle = IngestionLifecycle(engine, lambda kb: KBModel(kb_id=kb, deleted=0))

    def ingest(self, root, filename, status=200, chunks=None, processor_error=False):
        store = MagicMock()
        response = MagicMock()
        response.status_code = status
        response.iter_content.return_value = iter(chunks or [b"downloaded"])
        seen = []

        class Processor:
            def __init__(self, kb_id, file_id, work_dir, file_path, file_url, ingestion_guard=None):
                seen.append((Path(work_dir), Path(file_path), Path(file_path).read_bytes()))

            def process(self):
                if processor_error:
                    raise RuntimeError("parser failed")
                # Parser artifacts belong to the same task and must also be cleaned.
                (seen[-1][0] / "parser-output.txt").write_text("artifact")

        with patch.object(document.tempfile, "gettempdir", return_value=str(root)), \
             patch.object(document.uuid, "uuid4", return_value=MagicMock(hex="fixed-id")), \
             patch.object(document, "get_kb_file_store", return_value=store), \
             patch.object(document, "get_ingestion_lifecycle", return_value=self.lifecycle), \
             patch.object(document, "DocumentProcessor", Processor), \
             patch.object(document.download_utils.requests, "get", return_value=response):
            document.add_file(filename, "https://offline.invalid/document", "kb-1")
        return store.add_file.call_args.args[0], seen

    def test_host_absolute_and_parent_paths_cannot_overwrite_or_delete_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            victim = root / "keep.pdf"
            for filename in (str(victim), "../keep.pdf", "..\\keep.pdf"):
                with self.subTest(filename=filename):
                    victim.write_bytes(b"existing")
                    record, seen = self.ingest(root, filename)
                    self.assertTrue(victim.exists(), "ingestion deleted an existing file")
                    self.assertEqual(b"existing", victim.read_bytes())
                    self.assertEqual(TaskStatusEnum.SUCCESS.value, record.file_status)
                    work_dir, downloaded, content = seen[0]
                    self.assertEqual(work_dir, downloaded.parent)
                    self.assertEqual(b"downloaded", content)
                    self.assertFalse(work_dir.exists(), "task directory leaked")

    def test_windows_and_linux_path_syntax_never_becomes_storage_path(self):
        filenames = (
            "/var/keep.pdf", "C:\\private\\keep.pdf", "C:/private/keep.pdf",
            "C:keep.pdf", "\\\\server\\share\\keep.pdf", "\\private\\keep.pdf",
            "../../keep.pdf", "..\\..\\keep.pdf", "nested/keep.pdf",
            "keep.pdf:alternate", "file.pdf\\..\\keep.pdf",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for filename in filenames:
                with self.subTest(filename=filename):
                    # Do not write using hostile input even in the vulnerable version.
                    with patch.object(document.download_utils, "download_file", side_effect=RuntimeError("offline")) as download:
                        record, _ = self.ingest(root, filename)
                    destination = Path(download.call_args.args[1])
                    self.assertEqual(root, destination.parent.parent)
                    self.assertNotIn(destination.name, (filename, "keep.pdf"))
                    self.assertEqual(TaskStatusEnum.FAILED.value, record.file_status)
                    self.assertFalse(destination.parent.exists())

    def test_failed_http_download_preserves_existing_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            victim = root / "keep.pdf"
            victim.write_bytes(b"existing")
            record, seen = self.ingest(root, str(victim), status=404)
            self.assertTrue(victim.exists(), "failed download deleted an existing file")
            self.assertEqual(b"existing", victim.read_bytes())
            self.assertEqual(TaskStatusEnum.FAILED.value, record.file_status)
            self.assertEqual([], seen)

    def test_preexisting_uuid_directory_is_never_reused_or_cleaned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prior = root / "fixed-id"
            prior.mkdir()
            victim = prior / "report.pdf"
            victim.write_bytes(b"existing")
            record, seen = self.ingest(root, "report.pdf", processor_error=True)
            self.assertTrue(victim.exists())
            self.assertEqual(b"existing", victim.read_bytes())
            self.assertEqual(TaskStatusEnum.FAILED.value, record.file_status)
            self.assertNotEqual(prior, seen[0][0])
            self.assertFalse(seen[0][0].exists())

    def test_partial_download_failure_cleans_only_its_own_directory(self):
        def failing_chunks():
            yield b"partial"
            raise RuntimeError("connection lost")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            victim = root / "keep.txt"
            victim.write_bytes(b"existing")
            record, seen = self.ingest(root, "report.pdf", chunks=failing_chunks())
            self.assertEqual(TaskStatusEnum.FAILED.value, record.file_status)
            self.assertEqual([], seen)
            self.assertEqual([victim], list(root.iterdir()))
            self.assertEqual(b"existing", victim.read_bytes())


if __name__ == "__main__":
    unittest.main()
