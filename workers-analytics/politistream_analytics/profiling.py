from __future__ import annotations

from collections import Counter
from datetime import datetime
from statistics import mean
from typing import Any


def profile_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    columns = sorted({key for row in rows for key in row.keys()})
    profiles = [_profile_column(name, rows) for name in columns]
    missing = sum(column["missingCount"] for column in profiles)
    total = max(1, len(rows) * max(1, len(columns)))
    mixed = sum(1 for column in profiles if column["inferredType"] == "mixed")
    quality = max(0.0, min(1.0, 1 - (missing / total) * 0.7 - (mixed / max(1, len(columns))) * 0.3))
    return {
        "rowCount": len(rows),
        "columnCount": len(columns),
        "columns": profiles,
        "qualityScore": quality,
        "warnings": _warnings(len(rows), profiles),
    }


def _profile_column(name: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    values = [row.get(name) for row in rows]
    present = [value for value in values if value not in (None, "")]
    inferred = _infer_type(present)
    profile: dict[str, Any] = {
        "name": name,
        "inferredType": inferred,
        "totalCount": len(rows),
        "missingCount": len(rows) - len(present),
        "uniqueCount": len(Counter(str(value) for value in present)),
    }
    if inferred == "number":
        nums = sorted(float(value) for value in present)
        profile["min"] = nums[0] if nums else 0
        profile["max"] = nums[-1] if nums else 0
        profile["mean"] = mean(nums) if nums else 0
    elif inferred == "date":
        dates = sorted(_parse_date(value).isoformat() for value in present if _parse_date(value))
        if dates:
            profile["min"] = dates[0]
            profile["max"] = dates[-1]
    return profile


def _infer_type(values: list[Any]) -> str:
    if not values:
        return "empty"
    threshold = max(1, int(len(values) * 0.85))
    if sum(_is_number(value) for value in values) >= threshold:
        return "number"
    if sum(isinstance(value, bool) or str(value).lower() in {"true", "false"} for value in values) >= threshold:
        return "boolean"
    if sum(_parse_date(value) is not None for value in values) >= threshold:
        return "date"
    if all(isinstance(value, str) for value in values):
        return "string"
    return "mixed"


def _warnings(row_count: int, columns: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    if row_count == 0:
        warnings.append("empty dataset")
    for column in columns:
        if column["missingCount"] > 0:
            warnings.append(f"{column['name']} has {column['missingCount']} missing value(s)")
        if column["inferredType"] == "mixed":
            warnings.append(f"{column['name']} has mixed types")
    return warnings[:20]


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _parse_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not any(token in value for token in ("-", "/", "T", ":")):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
