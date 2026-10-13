"""Durable fences and cross-process locking without network/model calls."""
import multiprocessing
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine

from research_tool.tool.mrag.storage.ingestion_lifecycle import IngestionCancelled, IngestionLifecycle


def subprocess_write(path, epoch, entered, release):
    engine = create_engine("sqlite:///" + path)
    lifecycle = IngestionLifecycle(engine, lambda kb: SimpleNamespace(deleted=0))
    def operation():
        entered.set()
        if not release.wait(10): raise TimeoutError("worker release missing")
        with open(path + ".order", "a") as handle: handle.write("write\n")
    lifecycle.guard("kb-a", "file-a", epoch).write(operation)
    engine.dispose()


class IngestionLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "metadata.db")
        self.engine = create_engine("sqlite:///" + self.path)
        self.addCleanup(self.engine.dispose)
        self.lifecycle = IngestionLifecycle(self.engine, lambda kb: SimpleNamespace(deleted=0))

    def test_file_cancel_is_durable_and_does_not_cancel_other_files(self):
        epoch = self.lifecycle.capture("kb-a")
        first = self.lifecycle.guard("kb-a", "file-a", epoch)
        with self.lifecycle.deleting("kb-a", ["file-a"]): pass
        reopened = IngestionLifecycle(self.engine, self.lifecycle.kb_lookup)
        with self.assertRaises(IngestionCancelled): first.write(lambda: self.fail("late write"))
        with self.assertRaises(IngestionCancelled): reopened.guard("kb-a", "file-a", epoch).check()
        reopened.guard("kb-a", "file-b", epoch).check()

    def test_failed_kb_cleanup_keeps_fence_and_recreation_blocked_until_retry(self):
        old = self.lifecycle.guard("kb-a", "file-a")
        with self.assertRaisesRegex(RuntimeError, "offline"):
            with self.lifecycle.deleting("kb-a"): raise RuntimeError("offline")
        reopened = IngestionLifecycle(self.engine, self.lifecycle.kb_lookup)
        with self.assertRaises(IngestionCancelled): reopened.capture("kb-a")
        with self.assertRaises(IngestionCancelled): reopened.create("kb-a", lambda: True)
        with reopened.deleting("kb-a"): pass
        self.assertTrue(reopened.create("kb-a", lambda: True))
        with self.assertRaises(IngestionCancelled): old.check()
        reopened.guard("kb-a", "new-file").check()

    def test_failed_file_cleanup_still_stops_late_writes(self):
        guard = self.lifecycle.guard("kb-a", "file-a")
        with self.assertRaises(RuntimeError):
            with self.lifecycle.deleting("kb-a", ["file-a"]): raise RuntimeError("offline")
        with self.assertRaises(IngestionCancelled): guard.check()
        with self.lifecycle.deleting("kb-a", ["file-a"]): pass

    def test_active_duplicate_create_does_not_change_task_generation(self):
        guard = self.lifecycle.guard("kb-a", "file-a")
        self.assertFalse(self.lifecycle.create("kb-a", lambda: False))
        guard.check()

    def test_missing_kb_cannot_accept_new_task(self):
        lifecycle = IngestionLifecycle(self.engine, lambda kb: None)
        with self.assertRaises(IngestionCancelled): lifecycle.capture("missing")

    def test_another_kb_can_write_while_first_kb_is_locked(self):
        a = self.lifecycle.guard("kb-a", "file-a")
        b = self.lifecycle.guard("kb-b", "file-b")
        a.write(lambda: b.write(lambda: True))

    def test_cross_process_inflight_write_finishes_before_cleanup_and_no_late_write(self):
        epoch = self.lifecycle.capture("kb-a")
        context = multiprocessing.get_context("spawn")
        entered, release = context.Event(), context.Event()
        process = context.Process(target=subprocess_write, args=(self.path, epoch, entered, release))
        process.start()
        done = threading.Event(); deleting_started = threading.Event(); failures = []
        def delete():
            deleting_started.set()
            try:
                with self.lifecycle.deleting("kb-a"):
                    with open(self.path + ".order", "a") as handle: handle.write("delete\n")
            except BaseException as error: failures.append(error)
            finally: done.set()
        thread = None
        try:
            self.assertTrue(entered.wait(10))
            thread = threading.Thread(target=delete); thread.start()
            self.assertTrue(deleting_started.wait(2))
            self.assertFalse(done.wait(.1), "delete bypassed the worker's write lock")
            release.set(); process.join(10); thread.join(10)
            self.assertEqual(0, process.exitcode); self.assertTrue(done.is_set()); self.assertEqual([], failures)
            self.assertEqual(["write", "delete"], Path(self.path + ".order").read_text().splitlines())
            with self.assertRaises(IngestionCancelled): self.lifecycle.guard("kb-a", "file-a", epoch).check()
        finally:
            release.set(); process.join(10)
            if process.is_alive(): process.terminate(); process.join(5)
            if thread is not None: thread.join(10)


if __name__ == "__main__": unittest.main()
