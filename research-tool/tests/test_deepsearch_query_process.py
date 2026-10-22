# Parsing is pure and never invokes a model. Import the real module: replacing
# sys.modules at collection time breaks unrelated LLM tests in the full suite.
from research_tool.tool.search_component.query_process import (
    parse_report_structure,
)


def test_parse_report_structure_returns_chapter_and_search_queries():
    chapters = parse_report_structure(
        '[{"title":"技术路线","content":"分析电池和电控",'
        '"search_queries":["电池技术","电控技术","电池技术"]}]'
    )

    assert chapters == [
        {
            "title": "技术路线",
            "content": "分析电池和电控",
            "search_queries": ["电池技术", "电控技术"],
        }
    ]


def test_parse_report_structure_supports_legacy_query_list():
    chapters = parse_report_structure("- 技术路线\n- 市场格局")

    assert chapters == [
        {
            "title": "技术路线",
            "content": "技术路线",
            "search_queries": ["技术路线"],
        },
        {
            "title": "市场格局",
            "content": "市场格局",
            "search_queries": ["市场格局"],
        },
    ]
