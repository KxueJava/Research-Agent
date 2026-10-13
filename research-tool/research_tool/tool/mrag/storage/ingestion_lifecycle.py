"""Durable ingestion fencing, shared by workers using the same SQLite metadata.

One sidecar database per KB keeps unrelated KB writes independent. A SQLite
write transaction fences external writes and deletion; parsing and embedding
never hold it. Cancellation is committed before cleanup, including on failure.
"""
import hashlib
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path


class IngestionCancelled(RuntimeError):
    pass


class IngestionLifecycle:
    def __init__(self, engine, kb_lookup):
        database = engine.url.database
        if not database or database == ":memory:":
            raise ValueError("Ingestion fencing requires a file-backed SQLite database")
        database = Path(database).resolve()
        self.directory = database.parent / (database.name + ".ingestion")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.kb_lookup = kb_lookup

    @contextmanager
    def _locked(self, kb_id):
        name = hashlib.sha256(kb_id.encode("utf-8")).hexdigest() + ".sqlite"
        connection = sqlite3.connect(str(self.directory / name), timeout=30, isolation_level=None)
        try:
            connection.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL, cancelled INTEGER NOT NULL, pending INTEGER NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS cancelled_files (file_id TEXT PRIMARY KEY)")
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("INSERT OR IGNORE INTO state VALUES (1, ?, 0, 0)", (uuid.uuid4().hex,))
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _check(connection, epoch, file_id):
        current, cancelled, _ = connection.execute("SELECT epoch, cancelled, pending FROM state WHERE id=1").fetchone()
        if current != epoch or cancelled or connection.execute(
                "SELECT 1 FROM cancelled_files WHERE file_id=?", (file_id,)).fetchone():
            raise IngestionCancelled("Knowledge base or file ingestion has been cancelled")

    def capture(self, kb_id):
        with self._locked(kb_id) as connection:
            record = self.kb_lookup(kb_id)
            if record is None or record.deleted == 1:
                raise IngestionCancelled("Knowledge base is unavailable")
            epoch = connection.execute("SELECT epoch FROM state WHERE id=1").fetchone()[0]
            self._check(connection, epoch, "")
            return epoch

    def observe(self, kb_id, operation):
        """Bind a delete request's metadata snapshot to its resource generation."""
        with self._locked(kb_id) as connection:
            epoch = connection.execute("SELECT epoch FROM state WHERE id=1").fetchone()[0]
            return epoch, operation()

    def guard(self, kb_id, file_id, epoch=None):
        return IngestionGuard(self, kb_id, file_id, epoch if epoch is not None else self.capture(kb_id))

    def create(self, kb_id, operation):
        with self._locked(kb_id) as connection:
            if connection.execute("SELECT pending FROM state WHERE id=1").fetchone()[0]:
                raise IngestionCancelled("Knowledge base deletion is not complete")
            if not operation():
                return False
            connection.execute("UPDATE state SET epoch=?, cancelled=0, pending=0 WHERE id=1", (uuid.uuid4().hex,))
            connection.execute("DELETE FROM cancelled_files")
            return True

    @contextmanager
    def deleting(self, kb_id, file_ids=None, expected_epoch=None):
        with self._locked(kb_id) as connection:
            epoch = connection.execute("SELECT epoch FROM state WHERE id=1").fetchone()[0]
            if expected_epoch is not None and epoch != expected_epoch:
                raise IngestionCancelled("Knowledge base generation changed before deletion")
            if file_ids is None:
                connection.execute("UPDATE state SET cancelled=1, pending=1 WHERE id=1")
            else:
                connection.executemany("INSERT OR IGNORE INTO cancelled_files VALUES (?)", ((value,) for value in file_ids))
            # Never roll back the fence when an external cleanup fails.
            connection.commit()
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT epoch FROM state WHERE id=1").fetchone()[0] != epoch:
                raise IngestionCancelled("Knowledge base generation changed during deletion")
            yield
            if file_ids is None:
                connection.execute("UPDATE state SET pending=0 WHERE id=1")


class IngestionGuard:
    def __init__(self, lifecycle, kb_id, file_id, epoch):
        self.lifecycle, self.kb_id, self.file_id, self.epoch = lifecycle, kb_id, file_id, epoch

    def write(self, operation):
        with self.lifecycle._locked(self.kb_id) as connection:
            self.lifecycle._check(connection, self.epoch, self.file_id)
            if self.lifecycle.kb_lookup(self.kb_id) is None:
                raise IngestionCancelled("Knowledge base no longer exists")
            return operation()

    def check(self):
        self.write(lambda: None)
