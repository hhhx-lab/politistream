from __future__ import annotations

from math import sqrt
from statistics import mean, median, stdev
from typing import Any

from .profiling import profile_rows


def descriptive_statistics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    profile = profile_rows(rows)
    numeric_names = [column["name"] for column in profile["columns"] if column["inferredType"] == "number"]
    numeric = [_numeric_stats(name, rows) for name in numeric_names]
    correlations = []
    for index, left in enumerate(numeric_names):
        for right in numeric_names[index + 1:]:
            correlations.append({"x": left, "y": right, "correlation": _pearson(rows, left, right)})
    return {"numericColumns": numeric, "correlations": correlations}


def _numeric_stats(name: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    values = sorted(_numbers(row.get(name) for row in rows))
    std = stdev(values) if len(values) > 1 else 0
    standard_error = std / sqrt(len(values)) if values else 0
    margin = 1.96 * standard_error
    value_mean = mean(values) if values else 0
    return {
        "name": name,
        "count": len(values),
        "missingCount": len(rows) - len(values),
        "mean": value_mean,
        "median": median(values) if values else 0,
        "min": values[0] if values else 0,
        "max": values[-1] if values else 0,
        "standardDeviation": std,
        "standardError": standard_error,
        "confidenceInterval95": [value_mean - margin, value_mean + margin],
    }


def _pearson(rows: list[dict[str, Any]], x: str, y: str) -> float:
    pairs = [(float(row[x]), float(row[y])) for row in rows if _is_number(row.get(x)) and _is_number(row.get(y))]
    if len(pairs) < 2:
        return 0.0
    xs = [left for left, _ in pairs]
    ys = [right for _, right in pairs]
    x_mean = mean(xs)
    y_mean = mean(ys)
    numerator = sum((left - x_mean) * (right - y_mean) for left, right in pairs)
    x_denominator = sqrt(sum((value - x_mean) ** 2 for value in xs))
    y_denominator = sqrt(sum((value - y_mean) ** 2 for value in ys))
    denominator = x_denominator * y_denominator
    return 0.0 if denominator == 0 else numerator / denominator


def _numbers(values: Any) -> list[float]:
    return [float(value) for value in values if _is_number(value)]


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False
