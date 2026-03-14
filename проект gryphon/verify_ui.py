from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = [
    "index.html",
    "styles.css",
    "app.js",
]

REQUIRED_TOKENS = {
    "--bg": "#121212",
    "--surface": "#1e1e1e",
    "--primary": "#e0651d",
    "--secondary": "#f2a65a",
    "--highlight": "#ffe8d7",
    "--text": "#a4988e",
}

REQUIRED_HTML_MARKERS = [
    'aria-label="Financial growth dashboard prototype"',
    "Current Level",
    "Recommendations",
    "Skill Jar",
    "Fragments",
    "Cards",
    "Home",
    "Skill Cards",
    "Team",
    "Input",
    'aria-label="Profile"',
]

FORBIDDEN_HTML_MARKERS = [
    "Skill Tree",
    "Missions",
    "Wallet",
    "Notifications",
    "Profile</button>",
    "Today’s Habit",
]


def normalize(text: str) -> str:
    return text.lower()


def check_required_files() -> list[str]:
    issues: list[str] = []
    for file_name in REQUIRED_FILES:
        path = ROOT / file_name
        if not path.exists() or not path.is_file():
            issues.append(f"Missing required file: {file_name}")
    return issues


def check_design_tokens(styles_css: str) -> list[str]:
    issues: list[str] = []
    css_text = normalize(styles_css)

    for token, value in REQUIRED_TOKENS.items():
        expected = f"{token}: {value};"
        if expected not in css_text:
            issues.append(f"Missing or changed design token: {expected}")

    return issues


def check_html_markers(index_html: str) -> list[str]:
    issues: list[str] = []
    html_text = normalize(index_html)

    for marker in REQUIRED_HTML_MARKERS:
        if normalize(marker) not in html_text:
            issues.append(f"Missing required marker in index.html: {marker}")

    for marker in FORBIDDEN_HTML_MARKERS:
        if normalize(marker) in html_text:
            issues.append(f"Forbidden marker still present in index.html: {marker}")

    return issues


def main() -> int:
    issues: list[str] = []

    issues.extend(check_required_files())

    styles_path = ROOT / "styles.css"
    index_path = ROOT / "index.html"

    if styles_path.exists():
        issues.extend(check_design_tokens(styles_path.read_text(encoding="utf-8")))

    if index_path.exists():
        issues.extend(check_html_markers(index_path.read_text(encoding="utf-8")))

    if issues:
        print("UI baseline verification: FAILED")
        for issue in issues:
            print(f" - {issue}")
        return 1

    print("UI baseline verification: PASSED")
    print("Checked files, palette tokens, required sections, and forbidden regressions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
