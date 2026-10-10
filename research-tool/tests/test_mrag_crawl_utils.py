# -*- coding: utf-8 -*-
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from research_tool.tool.mrag.utils import crawl_utils


class MragCrawlUtilsTest(unittest.IsolatedAsyncioTestCase):
    def test_should_use_writable_temp_directory_by_default(self):
        with tempfile.TemporaryDirectory(prefix="mrag-crawl-default-") as temp_dir:
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("CRAWL4_AI_BASE_DIRECTORY", None)
                with patch.object(crawl_utils.tempfile, "gettempdir", return_value=temp_dir):
                    resolved = Path(crawl_utils._resolve_crawl4ai_base_directory())

            expected = Path(temp_dir) / "ai-agent-crawl4ai"
            self.assertEqual(expected, resolved)
            self.assertTrue((expected / ".crawl4ai").is_dir())
            self.assertEqual([], list((expected / ".crawl4ai").iterdir()))

    def test_should_fall_back_when_configured_directory_is_not_writable(self):
        with tempfile.TemporaryDirectory(prefix="mrag-crawl-fallback-") as temp_dir:
            configured = Path(temp_dir) / "configured"
            fallback_parent = Path(temp_dir) / "fallback-parent"
            original_probe = crawl_utils._probe_crawl4ai_directory

            def probe(candidate):
                if candidate == configured:
                    return False
                return original_probe(candidate)

            with patch.dict(
                os.environ,
                {"CRAWL4_AI_BASE_DIRECTORY": str(configured)},
                clear=False,
            ):
                with patch.object(crawl_utils.tempfile, "gettempdir", return_value=str(fallback_parent)):
                    with patch.object(
                        crawl_utils,
                        "_probe_crawl4ai_directory",
                        side_effect=probe,
                    ):
                        resolved = Path(crawl_utils._resolve_crawl4ai_base_directory())

            expected = fallback_parent / "ai-agent-crawl4ai"
            self.assertEqual(expected, resolved)
            self.assertFalse((configured / ".crawl4ai").exists())
            self.assertTrue((expected / ".crawl4ai").is_dir())
            self.assertEqual([], list((expected / ".crawl4ai").iterdir()))

    def test_should_fail_clearly_when_no_crawl4ai_directory_is_writable(self):
        with tempfile.TemporaryDirectory(prefix="mrag-crawl-unwritable-") as temp_dir:
            with patch.dict(
                os.environ,
                {"CRAWL4_AI_BASE_DIRECTORY": str(Path(temp_dir) / "configured")},
                clear=False,
            ):
                with patch.object(crawl_utils, "_probe_crawl4ai_directory", return_value=False):
                    with patch.object(crawl_utils.tempfile, "gettempdir", return_value=temp_dir):
                        with self.assertRaisesRegex(
                            PermissionError, "无法创建 Crawl4AI 可写缓存目录"
                        ):
                            crawl_utils._resolve_crawl4ai_base_directory()

    async def test_should_pass_configured_writable_base_directory_to_crawl4ai(self):
        crawler = AsyncMock()
        crawler.__aenter__.return_value = crawler
        crawler.arun.return_value.markdown = "# 标题\n\n正文"

        with patch.object(crawl_utils, "_build_browser_config", return_value=None):
            with patch.object(
                crawl_utils, "AsyncWebCrawler", return_value=crawler
            ) as crawler_factory:
                result = await crawl_utils.async_crawl("https://example.com/article")

        self.assertEqual("# 标题\n\n正文", result)
        crawler_factory.assert_called_once_with(
            base_directory=crawl_utils.CRAWL4AI_BASE_DIRECTORY
        )

    def test_should_prepare_driver_environment_without_mutating_process_temp(self):
        from playwright._impl import _transport

        stable_get_driver_env = _transport.get_driver_env
        base_driver_env = stable_get_driver_env()
        before = {
            name: os.environ.get(name)
            for name in ("TEMP", "TMP", "TMPDIR")
        }

        restore = crawl_utils._install_playwright_driver_environment()
        try:
            driver_env = _transport.get_driver_env()
            expected = str(Path(crawl_utils.CRAWL4AI_BASE_DIRECTORY) / ".crawl4ai")
            self.assertEqual(expected, driver_env["TEMP"])
            self.assertEqual(expected, driver_env["TMP"])
            self.assertEqual(expected, driver_env["TMPDIR"])
            self.assertEqual(before, {
                name: os.environ.get(name)
                for name in ("TEMP", "TMP", "TMPDIR")
            })
            self.assertIs(stable_get_driver_env, _transport.get_driver_env)
        finally:
            restore()

        self.assertIs(stable_get_driver_env, _transport.get_driver_env)
        self.assertEqual(base_driver_env, _transport.get_driver_env())

    def test_should_select_installed_system_chrome_when_available(self):
        with patch.object(crawl_utils, "_system_chrome_available", return_value=True):
            config = crawl_utils._build_browser_config()

        self.assertIsNotNone(config)
        self.assertTrue(config.headless)
        self.assertEqual("chrome", config.channel)
        self.assertEqual("chrome", config.chrome_channel)

    async def test_async_crawl_restores_driver_patch_and_process_temp(self):
        crawler = AsyncMock()
        crawler.arun.return_value.markdown = "# 标题\n\n正文"
        original_temp = {
            name: os.environ.get(name)
            for name in ("TEMP", "TMP", "TMPDIR")
        }
        restore = MagicMock()

        with patch.object(crawl_utils, "_build_browser_config", return_value=None):
            with patch.object(
                crawl_utils, "AsyncWebCrawler", return_value=crawler
            ) as crawler_factory:
                with patch.object(
                    crawl_utils,
                    "_install_playwright_driver_environment",
                    return_value=restore,
                ) as install:
                    result = await crawl_utils.async_crawl(
                        "https://example.com/article"
                    )

        self.assertEqual("# 标题\n\n正文", result)
        crawler_factory.assert_called_once_with(
            base_directory=crawl_utils.CRAWL4AI_BASE_DIRECTORY
        )
        crawler.start.assert_awaited_once_with()
        crawler.arun.assert_awaited_once_with(url="https://example.com/article")
        crawler.close.assert_awaited_once_with()
        install.assert_called_once_with()
        restore.assert_called_once_with()
        self.assertEqual(original_temp, {
            name: os.environ.get(name)
            for name in ("TEMP", "TMP", "TMPDIR")
        })


if __name__ == "__main__":
    unittest.main()
