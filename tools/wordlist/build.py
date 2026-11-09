# /// script
# requires-python = ">=3.11"
# dependencies = ["wordfreq"]
# ///
"""Print the word list: word, zipf frequency, core flag.

usage: uv run build.py ENABLE_PATH TWELVE_DICTS_DIR
"""
import re
import sys
from pathlib import Path

from wordfreq import zipf_frequency

MIN_ZIPF = 3.0
MIN_LEN, MAX_LEN = 3, 9
PURE = re.compile(r"^[a-z]+$")


def read_words(path: Path) -> set[str]:
    lines = (line.rstrip("\r\n").strip() for line in path.read_text().splitlines())
    return {line for line in lines if PURE.match(line)}


def main() -> None:
    enable = read_words(Path(sys.argv[1]))
    american = Path(sys.argv[2]) / "American"
    inflected = read_words(american / "2of12inf.txt")
    core = read_words(american / "6of12.txt")
    rows = []
    for word in enable & inflected:
        if not MIN_LEN <= len(word) <= MAX_LEN:
            continue
        zipf = zipf_frequency(word, "en")
        if zipf >= MIN_ZIPF:
            rows.append((zipf, word))
    rows.sort(key=lambda r: (-r[0], r[1]))
    for zipf, word in rows:
        print(word, f"{zipf:.2f}", int(word in core))


main()
