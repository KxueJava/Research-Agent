"""Offline deletion regressions; no client connection or persistent data is used."""
import unittest
from types import SimpleNamespace

from qdrant_client import models

from research_tool.tool.mrag.storage.qdrant_vector_store import (
    QdrantGenericVectorStore, QdrantTextVectorStore, QdrantVectorStore,
)
from research_tool.tool.mrag.storage.vector_store import VectorStore


class MemoryClient:
    def __init__(self):
        self.points = {
            name: [
                {"kb_id": "kb-1", "file_id": "file-1"},
                {"kb_id": "kb-1", "file_id": "file-2"},
                {"kb_id": "kb-2", "file_id": "file-1"},
            ] for name in ("text", "image", "page")
        }
        self.fail_collection = None

    def collection_exists(self, collection_name):
        return collection_name in self.points

    def delete(self, collection_name, points_selector, wait):
        if collection_name == self.fail_collection:
            raise OSError("backend unavailable")
        assert wait is True

        def matches(payload):
            return all(
                payload[condition.key] == condition.match.value
                if isinstance(condition.match, models.MatchValue)
                else payload[condition.key] in condition.match.any
                for condition in points_selector.must
            )

        self.points[collection_name] = [
            point for point in self.points[collection_name] if not matches(point)
        ]
        return models.UpdateResult(operation_id=1, status=models.UpdateStatus.COMPLETED)


def make_store(enabled=True):
    client = MemoryClient()
    backend = object.__new__(QdrantVectorStore)
    backend.client = client
    store = object.__new__(VectorStore)
    store.config = SimpleNamespace(image_vector_enabled=enabled, image_collection="image", page_collection="page")
    store._base_store = backend
    store._text_store = QdrantTextVectorStore(backend, "text")
    store._image_store = QdrantGenericVectorStore(backend, "image")
    store._page_store = QdrantGenericVectorStore(backend, "page")
    return store, client


class VectorDeletionTest(unittest.TestCase):
    def test_file_delete_cleans_all_modalities_and_preserves_other_scope(self):
        store, client = make_store()
        result = store.delete_by_file_ids("kb-1", ["file-1"])
        for name in ("text", "image", "page"):
            self.assertEqual(client.points[name], [
                {"kb_id": "kb-1", "file_id": "file-2"},
                {"kb_id": "kb-2", "file_id": "file-1"},
            ])
        self.assertIs(result, True)

    def test_kb_delete_cleans_each_modality_and_preserves_other_kb(self):
        store, client = make_store()
        for name in ("text", "image", "page"):
            self.assertIs(getattr(store, f"delete_{name}_by_kb_id")("kb-1"), True)
            self.assertEqual(client.points[name], [{"kb_id": "kb-2", "file_id": "file-1"}])

    def test_disabled_kb_modalities_still_clean_historical_vectors(self):
        store, client = make_store(enabled=False)
        self.assertIs(store.delete_image_by_kb_id("kb-1"), True)
        self.assertIs(store.delete_page_by_kb_id("kb-1"), True)
        self.assertEqual(client.points["image"], [{"kb_id": "kb-2", "file_id": "file-1"}])
        self.assertEqual(client.points["page"], [{"kb_id": "kb-2", "file_id": "file-1"}])

    def test_partial_file_failure_raises_and_retry_is_idempotent(self):
        store, client = make_store()
        client.fail_collection = "image"
        with self.assertRaises(Exception):
            store.delete_by_file_ids("kb-1", ["file-1"])
        client.fail_collection = None
        self.assertIs(store.delete_by_file_ids("kb-1", ["file-1"]), True)
        self.assertIs(store.delete_by_file_ids("kb-1", ["file-1"]), True)
        for points in client.points.values():
            self.assertNotIn({"kb_id": "kb-1", "file_id": "file-1"}, points)

    def test_disabled_images_still_delete_historical_file_vectors(self):
        store, client = make_store(enabled=False)
        self.assertIs(store.delete_by_file_ids("kb-1", ["file-1"]), True)
        self.assertEqual(len(client.points["text"]), 2)
        self.assertEqual(len(client.points["image"]), 2)
        self.assertEqual(len(client.points["page"]), 2)

    def test_disabled_images_with_absent_collections_are_successful_noops(self):
        store, client = make_store(enabled=False)
        del client.points["image"]
        del client.points["page"]
        self.assertIs(store.delete_by_file_ids("kb-1", ["file-1"]), True)
        self.assertIs(store.delete_image_by_kb_id("kb-1"), True)
        self.assertIs(store.delete_page_by_kb_id("kb-1"), True)

    def test_every_kb_delete_rejects_false_and_none_results(self):
        for name in ("text", "image", "page"):
            for result in (False, None):
                with self.subTest(name=name, result=result):
                    store, _ = make_store()
                    setattr(store, f"_{name}_store", SimpleNamespace(delete_by_kb_id=lambda kb: result))
                    with self.assertRaises(RuntimeError):
                        getattr(store, f"delete_{name}_by_kb_id")("kb-1")

    def test_file_delete_rejects_false_and_none_results_in_each_collection(self):
        for name in ("text", "image", "page"):
            for result in (False, None):
                with self.subTest(name=name, result=result):
                    store, _ = make_store()
                    setattr(store, f"_{name}_store", SimpleNamespace(delete_by_file_ids=lambda kb, files: result))
                    with self.assertRaises(RuntimeError):
                        store.delete_by_file_ids("kb-1", ["file-1"])

    def test_backend_error_propagates(self):
        store, client = make_store()
        client.fail_collection = "text"
        with self.assertRaises(OSError):
            store._text_store.delete_by_kb_id("kb-1")

    def test_backend_requires_completed_delete_confirmation(self):
        for result in (None, False, models.UpdateResult(operation_id=1, status=models.UpdateStatus.ACKNOWLEDGED)):
            with self.subTest(result=result):
                store, client = make_store()
                client.delete = lambda **kwargs: result
                with self.assertRaises(RuntimeError):
                    store._text_store.delete_by_kb_id("kb-1")

    def test_empty_file_list_is_successful_noop(self):
        store, client = make_store()
        self.assertIs(store.delete_by_file_ids("kb-1", []), True)
        self.assertTrue(all(len(points) == 3 for points in client.points.values()))

    def test_missing_collection_is_a_successful_idempotent_delete(self):
        store, client = make_store()
        del client.points["image"]
        self.assertIs(store.delete_by_file_ids("kb-1", ["file-1"]), True)

    def test_collection_probe_failure_is_not_treated_as_absent(self):
        store, client = make_store()

        def fail_probe(collection_name):
            raise PermissionError("unauthorized")

        client.collection_exists = fail_probe
        with self.assertRaises(PermissionError):
            store._text_store.delete_by_kb_id("kb-1")


if __name__ == "__main__":
    unittest.main()
