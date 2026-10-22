# -*- coding: utf-8 -*-
"""HTTP 文件下载到本地路径。"""
import requests

from .logger_utils import logger


def download_file(
        url: str,
        filename: str
):
    """流式下载到调用方拥有的路径；HTTP 失败必须中止解析。"""
    logger.info(f"Downloading {url} -> {filename}")
    from research_tool.api.knowledge_download import knowledge_download_headers
    headers=knowledge_download_headers(url)
    response = requests.get(url, stream=True, verify=True, timeout=300, headers=headers, allow_redirects=not bool(headers))
    try:
        if response.status_code != 200:
            raise RuntimeError(f"File download failed: HTTP {response.status_code}")
        with open(filename, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        logger.info(f"Downloaded {filename}")
    finally:
        response.close()
