# -*- coding: utf-8 -*-
"""网页抓取：crawl4ai 转 Markdown，供 URL 入库。"""
from contextvars import ContextVar
import os
import shutil
import tempfile
from pathlib import Path
from typing import Callable


def _probe_crawl4ai_directory(candidate: Path) -> bool:
    """确认 Crawl4AI 目录实际可写，并清理本次探针文件。"""
    crawl4ai_directory = candidate / ".crawl4ai"
    probe_path = None
    try:
        crawl4ai_directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=".write-probe-",
            dir=str(crawl4ai_directory),
            delete=False,
        ) as probe:
            probe_path = Path(probe.name)
            probe.write(b"crawl4ai-write-probe")
            probe.flush()
        return True
    except OSError:
        return False
    finally:
        if probe_path is not None:
            try:
                probe_path.unlink()
            except OSError:
                pass


def _resolve_crawl4ai_base_directory() -> str:
    """为 Crawl4AI 选择可写的缓存父目录。

    Crawl4AI 会在 ``base_directory/.crawl4ai`` 初始化数据库和日志。Windows
    服务进程有时无法写入用户目录，因此默认使用临时目录；显式配置的目录
    仍然优先使用，但只有在其目标目录可创建时才接受。
    """
    configured = os.getenv("CRAWL4_AI_BASE_DIRECTORY", "").strip()
    candidates = []
    if configured:
        candidates.append(Path(configured).expanduser())
    candidates.append(Path(tempfile.gettempdir()) / "ai-agent-crawl4ai")

    for candidate in candidates:
        if _probe_crawl4ai_directory(candidate):
            return str(candidate)

    raise PermissionError("无法创建 Crawl4AI 可写缓存目录")


# crawl4ai 的数据库模块在 import 时读取这个环境变量，因此必须在导入
# AsyncWebCrawler 之前完成目录选择。
CRAWL4AI_BASE_DIRECTORY = _resolve_crawl4ai_base_directory()
os.environ["CRAWL4_AI_BASE_DIRECTORY"] = CRAWL4AI_BASE_DIRECTORY

from crawl4ai import AsyncWebCrawler, BrowserConfig
from playwright._impl import _transport

from .logger_utils import logger


_PLAYWRIGHT_DRIVER_ENV_OVERRIDE: ContextVar[dict[str, str] | None] = ContextVar(
    "mrag_playwright_driver_env_override", default=None
)
_ORIGINAL_GET_DRIVER_ENV = _transport.get_driver_env


def _get_driver_env_with_context_override() -> dict[str, str]:
    """为当前抓取上下文覆盖 driver 临时目录，不改变进程环境。"""
    environment = _ORIGINAL_GET_DRIVER_ENV()
    override = _PLAYWRIGHT_DRIVER_ENV_OVERRIDE.get()
    if override:
        environment.update(override)
    return environment


# Playwright 的 driver 环境函数只安装一次。每个 async_crawl 通过
# ContextVar 传递自己的目录，避免跨事件循环共享 asyncio.Lock 或临时改写
# 模块函数；没有覆盖时，其他 Playwright 调用仍使用原始环境。
_transport.get_driver_env = _get_driver_env_with_context_override


def _build_playwright_driver_environment() -> dict[str, str]:
    """为 Playwright driver 构造独立环境，不修改当前进程环境。"""
    runtime_directory = Path(CRAWL4AI_BASE_DIRECTORY) / ".crawl4ai"
    runtime_directory.mkdir(parents=True, exist_ok=True)
    runtime_directory = str(runtime_directory)
    return {
        name: runtime_directory
        for name in ("TEMP", "TMP", "TMPDIR")
    }


def _install_playwright_driver_environment() -> Callable[[], None]:
    """让当前 Playwright driver 使用可写临时目录，然后返回恢复函数。"""
    token = _PLAYWRIGHT_DRIVER_ENV_OVERRIDE.set(
        _build_playwright_driver_environment()
    )

    def restore() -> None:
        _PLAYWRIGHT_DRIVER_ENV_OVERRIDE.reset(token)

    return restore


def _system_chrome_available() -> bool:
    """判断 Playwright 的 chromium 缺失时是否有可用的系统 Chrome。"""
    if os.name == "nt":
        candidates = []
        for root_name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            root = os.getenv(root_name)
            if root:
                candidates.append(
                    Path(root) / "Google" / "Chrome" / "Application" / "chrome.exe"
                )
        return any(candidate.is_file() for candidate in candidates)

    return any(
        shutil.which(command)
        for command in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
    )


def _build_browser_config():
    """优先使用本机 Chrome，避免 Playwright 缓存版本缺失导致导入失败。"""
    if not _system_chrome_available():
        return None
    return BrowserConfig(headless=True, channel="chrome", chrome_channel="chrome")


async def async_crawl(url: str) -> str:
    """异步抓取，失败返回空串。"""
    browser_config = _build_browser_config()
    crawler_kwargs = {"base_directory": CRAWL4AI_BASE_DIRECTORY}
    if browser_config is not None:
        crawler_kwargs["config"] = browser_config

    crawler = AsyncWebCrawler(**crawler_kwargs)
    crawler_started = False
    try:
        restore_driver_environment = _install_playwright_driver_environment()
        try:
            await crawler.start()
            crawler_started = True
        finally:
            restore_driver_environment()

        result = await crawler.arun(url=url)

        return result.markdown
    except Exception as e:
        logger.error(f"Failed to crawl {url}: {e}")
        return ""
    finally:
        if crawler_started:
            await crawler.close()


def crawl(url: str) -> str:
    """同步包装 async_crawl。"""
    import asyncio
    return asyncio.run(async_crawl(url))
