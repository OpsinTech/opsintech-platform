from deerflow.sandbox.tools import MAX_LINES_PER_READ, _apply_line_limit


def _make_content(num_lines: int) -> str:
    return "\n".join(f"line {i}" for i in range(1, num_lines + 1))


class TestApplyLineLimit:
    """Tests for _apply_line_limit — the core line-limiting helper."""

    def test_empty_content_returns_empty(self):
        assert _apply_line_limit("", None, None) == "(empty)"

    def test_small_file_no_truncation(self):
        content = _make_content(10)
        result = _apply_line_limit(content, None, None)
        assert result == content
        assert "[System Warning" not in result

    def test_large_file_no_params_truncates(self):
        content = _make_content(1000)
        result = _apply_line_limit(content, None, None)

        lines = result.splitlines()
        content_lines = [line for line in lines if line.startswith("line ")]
        assert len(content_lines) == MAX_LINES_PER_READ
        assert "line 1" in result
        assert f"line {MAX_LINES_PER_READ}" in result
        assert f"line {MAX_LINES_PER_READ + 1}" not in result

    def test_large_file_no_params_includes_warning(self):
        content = _make_content(MAX_LINES_PER_READ + 100)
        result = _apply_line_limit(content, None, None)

        assert "[System Warning" in result
        assert f"The file has {MAX_LINES_PER_READ + 100} lines in total" in result
        assert f"Only lines 1 to {MAX_LINES_PER_READ} are shown here" in result
        assert f"start_line={MAX_LINES_PER_READ + 1}" in result

    def test_explicit_start_line_within_range(self):
        content = _make_content(1000)
        result = _apply_line_limit(content, 100, 200)

        content_lines = [line for line in result.splitlines() if line.startswith("line ")]
        assert content_lines[0] == "line 100"
        assert content_lines[-1] == "line 200"
        assert "[System Warning" in result

    def test_explicit_range_exceeds_max_lines_clamped(self):
        content = _make_content(2000)
        result = _apply_line_limit(content, 1, 2000)

        content_lines = [line for line in result.splitlines() if line.startswith("line ")]
        assert len(content_lines) == MAX_LINES_PER_READ
        assert f"Only lines 1 to {MAX_LINES_PER_READ} are shown here" in result

    def test_start_line_beyond_end_line(self):
        content = _make_content(100)
        result = _apply_line_limit(content, 50, 30)
        assert result or result == ""

    def test_start_line_greater_than_total(self):
        content = _make_content(10)
        result = _apply_line_limit(content, 20, 30)
        assert "[System Warning" not in result

    def test_end_line_exactly_total_no_warning(self):
        content = _make_content(100)
        result = _apply_line_limit(content, 51, 100)
        assert "[System Warning" not in result

    def test_end_line_less_than_total_with_warning(self):
        content = _make_content(100)
        result = _apply_line_limit(content, 1, 50)
        assert "[System Warning" in result
        assert "The file has 100 lines in total" in result
        assert "start_line=51" in result

    def test_negative_start_line_clamped_to_1(self):
        content = _make_content(100)
        result = _apply_line_limit(content, -10, 10)
        assert "line 1" in result
        assert "line 10" in result

    def test_single_line_file(self):
        result = _apply_line_limit("only one line", None, None)
        assert result == "only one line"
        assert "[System Warning" not in result

    def test_empty_lines_file(self):
        content = "\n" * 100
        result = _apply_line_limit(content, None, None)
        assert result != "(empty)"
        assert "[System Warning" not in result

    def test_exact_max_lines_no_warning(self):
        content = _make_content(MAX_LINES_PER_READ)
        result = _apply_line_limit(content, None, None)
        assert result == content
        assert "[System Warning" not in result

    def test_just_over_max_lines_triggers_warning(self):
        content = _make_content(MAX_LINES_PER_READ + 1)
        result = _apply_line_limit(content, None, None)
        assert "[System Warning" in result
        assert f"The file has {MAX_LINES_PER_READ + 1} lines in total" in result

    def test_start_line_none_end_line_small_no_truncation(self):
        content = _make_content(50)
        result = _apply_line_limit(content, None, 40)
        assert "line 40" in result
        assert "line 41" not in result
        assert "[System Warning" in result

    def test_large_file_second_chunk(self):
        total = MAX_LINES_PER_READ * 3
        content = _make_content(total)
        start = MAX_LINES_PER_READ + 1
        result = _apply_line_limit(content, start, None)

        content_lines = [line for line in result.splitlines() if line.startswith("line ")]
        assert len(content_lines) == MAX_LINES_PER_READ
        assert content_lines[0] == f"line {start}"
        assert content_lines[-1] == f"line {start + MAX_LINES_PER_READ - 1}"

    def test_warning_not_appended_to_last_chunk(self):
        total = MAX_LINES_PER_READ * 3
        content = _make_content(total)
        start = MAX_LINES_PER_READ * 2 + 1
        end = MAX_LINES_PER_READ * 3
        result = _apply_line_limit(content, start, end)

        content_lines = [line for line in result.splitlines() if line.startswith("line ")]
        assert len(content_lines) == MAX_LINES_PER_READ
        assert "[System Warning" not in result
