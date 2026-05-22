#!/usr/bin/env python3
"""Preservation gate for the PDF content-cleanup pass (quality-poll.sh Phase 3).

The LLM is asked to fix *structure* only — never to reword, summarize, or add
content. This gate verifies that deterministically before the cleaned HTML is
allowed to overwrite the original.

Usage:
    pdf-cleanup-gate.py <original.html> <cleaned.html>
Prints exactly one line:
    ACCEPT
    REJECT: <reason>

Checks:
  * hallucination — tokens present in the cleaned text but not the original
    (beyond a 3% tolerance for hyphen-merge / punctuation edge cases)
  * over-deletion — cleaned kept < 70% of the original word count
    (running headers / page numbers are a few %; 30% headroom is generous)

Line-wrap hyphens are joined before tokenizing, so a legitimate
"chal<U+2010> lenges" -> "challenges" merge is not seen as a new word.
Stdlib only.
"""
import html
import re
import sys
from collections import Counter

# A hyphen (ASCII, U+2010, U+00AD soft, U+2011 non-breaking) followed by
# whitespace = a line-wrap split. Remove both to rejoin the word.
_HYPHEN_WRAP = re.compile(r"[-‐­‑]\s+")
_TAG = re.compile(r"<[^>]+>")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)

# Tolerances.
HALLUCINATION_MAX = 0.03   # ≤3% novel tokens allowed
RETENTION_MIN = 0.70       # must keep ≥70% of original tokens


def tokenize(raw: str) -> Counter:
    text = html.unescape(_TAG.sub(" ", raw)).lower()
    text = _HYPHEN_WRAP.sub("", text)
    return Counter(_WORD.findall(text))


def verdict(original: str, cleaned: str) -> str:
    orig = tokenize(original)
    clean = tokenize(cleaned)
    n_orig = sum(orig.values())
    n_clean = sum(clean.values())

    if n_clean == 0:
        return "REJECT: cleaned output has no text"
    if n_orig == 0:
        return "ACCEPT"  # nothing to preserve

    novel = sum((clean - orig).values())
    if novel / n_clean > HALLUCINATION_MAX:
        return (f"REJECT: {novel}/{n_clean} novel tokens "
                f"(>{HALLUCINATION_MAX:.0%}) — possible hallucination")

    if n_clean < RETENTION_MIN * n_orig:
        return (f"REJECT: kept {n_clean}/{n_orig} tokens "
                f"(<{RETENTION_MIN:.0%}) — over-deletion")

    return "ACCEPT"


def main() -> int:
    if len(sys.argv) != 3:
        print("REJECT: usage: pdf-cleanup-gate.py <original> <cleaned>")
        return 2
    try:
        with open(sys.argv[1], encoding="utf-8") as f:
            original = f.read()
        with open(sys.argv[2], encoding="utf-8") as f:
            cleaned = f.read()
    except OSError as exc:
        print(f"REJECT: cannot read input — {exc}")
        return 2

    print(verdict(original, cleaned))
    return 0


if __name__ == "__main__":
    sys.exit(main())
