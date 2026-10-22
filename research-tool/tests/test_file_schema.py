import unittest
from unittest.mock import patch
from sqlalchemy import create_engine,inspect,text
from research_tool.db.db_engine import init_db

class FileSchemaTest(unittest.TestCase):
    def test_existing_records_are_legacy_and_migration_is_idempotent(self):
        engine=create_engine("sqlite://")
        try:
            with engine.begin() as db:
                db.execute(text("CREATE TABLE fileinfo (id INTEGER PRIMARY KEY, filename VARCHAR)"))
                db.execute(text("INSERT INTO fileinfo(id,filename) VALUES(1,'old.pdf')"))
            with patch("research_tool.db.db_engine.engine",engine):
                init_db();init_db()
            self.assertIn("resource_kind",{c["name"] for c in inspect(engine).get_columns("fileinfo")})
            with engine.connect() as db:
                self.assertEqual("legacy",db.execute(text("SELECT resource_kind FROM fileinfo WHERE id=1")).scalar())
        finally:
            engine.dispose()
