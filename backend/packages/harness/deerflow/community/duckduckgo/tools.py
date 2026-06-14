"""
DuckDuckGo web_search and web_fetch tools via ddgs library.

These are the default community tools — free, no API key required.
Users who want premium providers (Tavily, Firecrawl, etc.) can register
MCP tools through the admin UI.
"""

import json
import logging

import httpx
from langchain.tools import tool

from deerflow.utils.readability import ReadabilityExtractor

logger = logging.getLogger(__name__)

readability_extractor = ReadabilityExtractor()


def _search_web(query: str, max_results: int = 5) -> str:
    try:
        from ddgs import DDGS
    except ImportError:
        logger.error("ddgs library not installed. Run: pip install ddgs")
        return json.dumps({"error": "search library not available"})

    ddgs = DDGS(timeout=30)
    try:
        results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return json.dumps(
                {"error": "No results found", "query": query},
                ensure_ascii=False,
            )

        normalized = [
            {
                "title": r.get("title", ""),
                "url": r.get("href", r.get("url", "")),
                "snippet": r.get("body", ""),
            }
            for r in results
        ]

        return json.dumps(normalized, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"web_search failed: {e}")
        return json.dumps(
            {"error": f"Search failed: {e}", "query": query},
            ensure_ascii=False,
        )


def _fetch_page(url: str, timeout: int = 30) -> str:
    try:
        resp = httpx.get(
            url,
            timeout=timeout,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        return f"Error fetching page: HTTP {e.response.status_code}"
    except httpx.RequestError as e:
        return f"Error fetching page: {e}"

    try:
        article = readability_extractor.extract_article(resp.text)
        return article.to_markdown()[:4096]
    except Exception as e:
        return f"Error extracting content: {e}"


@tool("web_search", parse_docstring=True)
def web_search_tool(query: str) -> str:
    """Search the web using DuckDuckGo.

    Args:
        query: The query to search for.
    """
    return _search_web(query)


@tool("web_fetch", parse_docstring=True)
def web_fetch_tool(url: str) -> str:
    """Fetch the contents of a web page at a given URL.

    Only fetch EXACT URLs that have been provided directly by the user or
    have been returned in results from web_search and web_fetch tools.
    This tool can NOT access content that requires authentication.

    URLs must include the schema: https://example.com is valid,
    example.com is invalid.

    Args:
        url: The URL to fetch the contents of.
    """
    return _fetch_page(url)
