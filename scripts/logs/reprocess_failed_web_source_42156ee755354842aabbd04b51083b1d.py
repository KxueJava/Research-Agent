"""一次性恢复既有网页资料源，不新增资料记录。"""
import asyncio
import json
import os
import shutil
import sqlite3
from pathlib import Path

from research_tool.tool.mrag.document import DocumentProcessor
from research_tool.tool.mrag.storage import VectorStore
from research_tool.tool.mrag.storage.models.kb_file_model import KBFileModel
from research_tool.tool.mrag.storage.store_factory import (
    get_kb_doc_store,
    get_kb_file_store,
)
from research_tool.tool.mrag.utils.crawl_utils import async_crawl


KB_ID = "ab1ae802ab9f4ed18c98963aecc82bd1"
FILE_ID = "42156ee755354842aabbd04b51083b1d"
URL = "https://www.java.com/zh-CN/"
DB_PATH = Path(os.getenv("SQLITE_PATH", "mrag_sqlite.db"))
WORK_ROOT = Path(__file__).resolve().parents[2] / "scripts" / "logs"


def restore_visible_file_row() -> KBFileModel:
    """只恢复目标行的软删除标记，保留 file_id 与其历史字段。"""
    connection = sqlite3.connect(DB_PATH, timeout=30)
    try:
        row = connection.execute(
            "SELECT deleted FROM t_kb_file WHERE kb_id = ? AND file_id = ?",
            (KB_ID, FILE_ID),
        ).fetchone()
        if row is None:
            raise RuntimeError(f"target file row not found: {FILE_ID}")
        if row[0] != 0:
            connection.execute(
                "UPDATE t_kb_file SET deleted = 0, modify_time = CURRENT_TIMESTAMP "
                "WHERE kb_id = ? AND file_id = ?",
                (KB_ID, FILE_ID),
            )
            connection.commit()
    finally:
        connection.close()

    record = get_kb_file_store().get_file(KB_ID, FILE_ID)
    if record is None:
        raise RuntimeError(f"target file row is not visible: {FILE_ID}")
    return record


def update_status(record: KBFileModel, status: str, error_message: str | None = None) -> None:
    record.file_status = status
    record.task_status = {
        "global_status": status,
        **({"error_message": error_message} if error_message else {}),
    }
    get_kb_file_store().update_file(record)


def main() -> None:
    record = restore_visible_file_row()
    vector_store = VectorStore()
    before_points = vector_store.count_text_points({"kb_id": KB_ID, "file_id": FILE_ID})
    if before_points:
        raise RuntimeError(
            f"refusing to duplicate existing vectors for {FILE_ID}: {before_points} points"
        )

    work_dir: Path | None = None
    try:
        markdown = asyncio.run(async_crawl(URL))
        if not markdown.strip():
            raise RuntimeError("Crawl4AI returned empty markdown")

        work_dir = Path(
            __import__("tempfile").mkdtemp(
                prefix=f"mrag-reprocess-{FILE_ID}-", dir=str(WORK_ROOT)
            )
        )
        local_file_path = work_dir / f"{FILE_ID}.md"
        local_file_path.write_text(markdown, encoding="utf-8")

        update_status(record, "RUNNING")
        processor = DocumentProcessor(
            KB_ID, FILE_ID, str(work_dir), str(local_file_path), URL
        )
        processor.process()

        point_count = vector_store.count_text_points({"kb_id": KB_ID, "file_id": FILE_ID})
        canonical = get_kb_doc_store().get_canonical_doc(KB_ID, FILE_ID)
        if point_count <= 0:
            raise RuntimeError("DocumentProcessor produced no Qdrant text points")
        if canonical is None or not (canonical.text or "").strip():
            raise RuntimeError("DocumentProcessor produced no canonical full text")

        record.doc_count = point_count
        update_status(record, "SUCCESS")
        print(
            json.dumps(
                {
                    "file_id": FILE_ID,
                    "file_status": record.file_status,
                    "doc_count": point_count,
                    "canonical_text_length": len(canonical.text or ""),
                    "qdrant_points": point_count,
                    "markdown_length": len(markdown),
                },
                ensure_ascii=False,
            )
        )
    except Exception as exc:
        update_status(record, "FAILED", str(exc))
        raise
    finally:
        if work_dir is not None and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
