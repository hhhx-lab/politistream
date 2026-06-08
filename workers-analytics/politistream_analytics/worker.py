from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .advanced import (
    anomaly_detection,
    data_cleaning,
    data_transformation,
    deep_learning_analysis,
    dimensionality_reduction,
    export_report,
    frequency_tables,
    geospatial_analysis,
    logistic_regression,
    model_explanation,
    news_organization,
    poisson_regression,
    publication_chart,
    statistical_tests,
    text_analysis,
    time_series_analysis,
)
from .profiling import profile_rows
from .statistics import descriptive_statistics

try:
    import trafilatura
except Exception:  # pragma: no cover
    trafilatura = None

try:
    from unstructured.partition.auto import partition
except Exception:  # pragma: no cover
    partition = None


def main() -> None:
    parser = argparse.ArgumentParser(description="PolitiStream analytics worker CLI")
    parser.add_argument(
        "command",
        choices=[
            "profile",
            "stats",
            "quality",
            "frequency",
            "crosstab",
            "tests",
            "regression",
            "logistic",
            "poisson",
            "dimension",
            "cluster",
            "anomaly",
            "timeseries",
            "transform",
            "cleaning",
            "news",
            "text",
            "explain",
            "deepml",
            "geo",
            "chart",
            "report",
            "export",
            "inspect-file",
        ],
    )
    parser.add_argument("--input", required=True, help="Path to a JSON rows file or inspect request file")
    parser.add_argument("--output", required=True, help="Path to write JSON result")
    args = parser.parse_args()

    payload = _read_json(Path(args.input))
    if args.command == "profile":
        result = profile_rows(_read_rows(payload))
    elif args.command == "stats":
        result = descriptive_statistics(_read_rows(payload))
    elif args.command == "quality":
        result = quality_report(_read_rows(payload))
    elif args.command == "frequency":
        result = frequency_tables(_read_rows(payload))
    elif args.command == "crosstab":
        result = crosstab_analysis(_read_rows(payload))
    elif args.command == "tests":
        result = statistical_tests(_read_rows(payload))
    elif args.command == "regression":
        result = regression_analysis(_read_rows(payload))
    elif args.command == "logistic":
        result = logistic_regression(_read_rows(payload))
    elif args.command == "poisson":
        result = poisson_regression(_read_rows(payload))
    elif args.command == "dimension":
        result = dimensionality_reduction(_read_rows(payload))
    elif args.command == "cluster":
        result = cluster_analysis(_read_rows(payload))
    elif args.command == "anomaly":
        result = anomaly_detection(_read_rows(payload))
    elif args.command == "timeseries":
        result = time_series_analysis(_read_rows(payload))
    elif args.command == "transform":
        result = data_transformation(_read_rows(payload))
    elif args.command == "cleaning":
        result = data_cleaning(_read_rows(payload))
    elif args.command == "news":
        result = news_organization(_read_rows(payload))
    elif args.command == "text":
        result = text_analysis(_read_rows(payload))
    elif args.command == "explain":
        result = model_explanation(_read_rows(payload))
    elif args.command == "deepml":
        result = deep_learning_analysis(_read_rows(payload))
    elif args.command == "geo":
        result = geospatial_analysis(_read_rows(payload))
    elif args.command == "chart":
        result = publication_chart(_read_rows(payload))
    elif args.command == "report":
        result = report_draft(_read_rows(payload))
    elif args.command == "export":
        result = export_report(_read_rows(payload))
    else:
        result = inspect_file(payload)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def quality_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    profile = profile_rows(rows)
    total_cells = max(1, profile["rowCount"] * max(1, profile["columnCount"]))
    missing_cells = sum(column["missingCount"] for column in profile["columns"])
    duplicate_rows = len(rows) - len({_stable_row_key(row) for row in rows})
    column_scores = []
    for column in profile["columns"]:
        missing_ratio = column["missingCount"] / max(1, column["totalCount"])
        uniqueness_ratio = column["uniqueCount"] / max(1, column["totalCount"])
        type_penalty = 0.3 if column["inferredType"] == "mixed" else 0
        column_scores.append({
            "name": column["name"],
            "inferredType": column["inferredType"],
            "missingRatio": round(missing_ratio, 4),
            "uniquenessRatio": round(uniqueness_ratio, 4),
            "score": round(max(0, min(1, 1 - missing_ratio * 0.6 - type_penalty)), 4),
        })

    return {
        "profile": profile,
        "quality": {
            "score": profile["qualityScore"],
            "missingCellRatio": round(missing_cells / total_cells, 4),
            "duplicateRows": duplicate_rows,
            "duplicateRowRatio": round(duplicate_rows / max(1, len(rows)), 4),
            "columnScores": column_scores,
        },
        "checks": [
            {"id": "missing-values", "status": "warn" if missing_cells else "pass", "message": f"{missing_cells} missing cell(s)"},
            {"id": "duplicate-rows", "status": "warn" if duplicate_rows else "pass", "message": f"{duplicate_rows} duplicate row(s)"},
            {"id": "mixed-types", "status": "warn" if any(column["inferredType"] == "mixed" for column in profile["columns"]) else "pass", "message": "mixed type columns checked"},
        ],
    }


def crosstab_analysis(rows: list[dict[str, Any]]) -> dict[str, Any]:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return {"tables": [], "message": "empty dataset"}
    categorical = [
        column for column in frame.columns
        if frame[column].dropna().astype(str).nunique() <= min(20, max(2, len(frame)))
    ]
    if len(categorical) < 2:
        return {"tables": [], "message": "need at least two categorical columns"}
    left, right = categorical[:2]
    table = pd.crosstab(frame[left].astype(str), frame[right].astype(str), margins=True)
    return {
        "x": left,
        "y": right,
        "tables": [{
            "caption": f"{left} x {right}",
            "headers": [str(column) for column in table.columns.tolist()],
            "rows": [[str(index), *[int(value) for value in row]] for index, row in zip(table.index.tolist(), table.values.tolist())],
        }],
    }


def regression_analysis(rows: list[dict[str, Any]]) -> dict[str, Any]:
    frame = _numeric_frame(rows)
    if frame.shape[1] < 2 or frame.shape[0] < 3:
        return {"model": "linear-regression", "status": "insufficient_numeric_data", "message": "need at least two numeric columns and three rows"}
    y_name = frame.columns[-1]
    x_names = list(frame.columns[:-1])
    y = frame[y_name].to_numpy(dtype=float)
    x = frame[x_names].to_numpy(dtype=float)
    ones = pd.Series([1.0] * len(frame)).to_numpy().reshape(-1, 1)
    design = _concat_columns(ones, x)
    coefficients = _least_squares(design, y)
    predicted = design @ coefficients
    residuals = y - predicted
    ss_res = float((residuals ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r_squared = 1 - ss_res / ss_tot if ss_tot else 0.0
    names = ["intercept", *x_names]
    return {
        "model": "linear-regression",
        "target": y_name,
        "features": x_names,
        "rowCount": int(frame.shape[0]),
        "rSquared": round(float(r_squared), 6),
        "coefficients": [{"name": name, "value": round(float(value), 6)} for name, value in zip(names, coefficients.tolist())],
        "residualSummary": {
            "mean": round(float(residuals.mean()), 6),
            "rmse": round(float(math.sqrt((residuals ** 2).mean())), 6),
        },
    }


def cluster_analysis(rows: list[dict[str, Any]]) -> dict[str, Any]:
    frame = _numeric_frame(rows)
    if frame.shape[1] < 1 or frame.shape[0] < 3:
        return {"model": "kmeans", "status": "insufficient_numeric_data", "message": "need numeric columns and at least three rows"}
    k = min(3, max(2, int(math.sqrt(frame.shape[0]))))
    values = frame.to_numpy(dtype=float)
    centroids = values[:k].copy()
    labels = [0] * len(values)
    for _ in range(12):
        labels = [_nearest_centroid(row, centroids) for row in values]
        for cluster_id in range(k):
            members = values[[index for index, label in enumerate(labels) if label == cluster_id]]
            if len(members):
                centroids[cluster_id] = members.mean(axis=0)
    counts = {str(cluster_id): labels.count(cluster_id) for cluster_id in range(k)}
    return {
        "model": "kmeans",
        "k": k,
        "features": [str(column) for column in frame.columns.tolist()],
        "clusterCounts": counts,
        "centroids": [
            {"cluster": cluster_id, "values": {str(column): round(float(value), 6) for column, value in zip(frame.columns.tolist(), centroid.tolist())}}
            for cluster_id, centroid in enumerate(centroids)
        ],
        "assignments": [{"rowIndex": index, "cluster": label} for index, label in enumerate(labels[:100])],
    }


def report_draft(rows: list[dict[str, Any]]) -> dict[str, Any]:
    profile = profile_rows(rows)
    stats = descriptive_statistics(rows)
    quality = quality_report(rows)["quality"]
    lines = [
        "# Data Lab 分析报告草稿",
        "",
        "## 数据概况",
        f"- 行数：{profile['rowCount']}",
        f"- 列数：{profile['columnCount']}",
        f"- 数据质量分：{round(profile['qualityScore'] * 100)}%",
        f"- 缺失单元格比例：{quality['missingCellRatio']}",
        "",
        "## 数值字段摘要",
    ]
    for column in stats["numericColumns"][:8]:
        lines.append(
            f"- {column['name']}：均值 {round(column['mean'], 4)}，中位数 {round(column['median'], 4)}，范围 {column['min']} - {column['max']}"
        )
    if not stats["numericColumns"]:
        lines.append("- 未识别到数值字段。")
    lines.extend([
        "",
        "## 质量提示",
        *(f"- {warning}" for warning in profile["warnings"][:10]),
        "",
        "## 后续建议",
        "- 对缺失值较高的字段先确认采集口径，再做填补或剔除。",
        "- 对核心数值字段生成分布图、箱线图和相关矩阵。",
        "- 如存在分类字段，可继续运行交叉表；如存在两个以上数值字段，可继续运行回归或聚类。",
    ])
    return {
        "format": "markdown",
        "markdown": "\n".join(lines),
        "profile": profile,
        "statistics": stats,
    }


def inspect_file(payload: dict[str, Any]) -> dict[str, Any]:
    source_path = Path(str(payload["sourcePath"]))
    if not source_path.exists():
        raise FileNotFoundError(f"source file not found: {source_path}")

    kind = str(payload.get("kind") or source_path.suffix.lstrip(".").lower() or "unknown").lower()
    content_type = str(payload.get("contentType") or "").lower()
    max_rows = int(payload.get("maxRows") or 50)
    raw_bytes = source_path.read_bytes()
    file_size = len(raw_bytes)

    if kind in {"csv", "tsv"} or "csv" in content_type or "tab-separated" in content_type:
        return inspect_tabular(source_path, raw_bytes, payload, kind, max_rows, file_size)

    if kind in {"json", "jsonl", "ndjson", "geojson"} or "json" in content_type:
        return inspect_json_like(source_path, raw_bytes, payload, kind, max_rows, file_size)

    if kind in {"parquet"}:
        return inspect_parquet(source_path, payload, max_rows, file_size)

    if kind in {"xlsx", "xls"} or "excel" in content_type:
        return inspect_excel(source_path, payload, max_rows, file_size)

    if kind in {"xml", "sdmx", "xbrl"} or "xml" in content_type:
        return inspect_xml(source_path, raw_bytes, payload, kind, max_rows, file_size)

    if kind in {"html", "htm", "xhtml"} or "html" in content_type:
        return inspect_html(source_path, raw_bytes, payload, kind, max_rows, file_size)

    if kind in {"docx", "pptx", "txt", "md"} or "text" in content_type:
        return inspect_text_document(source_path, raw_bytes, payload, kind, max_rows, file_size)

    return inspect_binary(source_path, payload, kind, content_type, file_size)


def inspect_html(path: Path, raw_bytes: bytes, payload: dict[str, Any], kind: str, max_rows: int, file_size: int) -> dict[str, Any]:
    html = raw_bytes.decode("utf-8", errors="ignore")
    title = _extract_html_title(html)
    metadata: dict[str, Any] = {
        "kind": kind,
        "fileSizeBytes": file_size,
        "sourcePath": str(path),
    }

    if trafilatura is not None:
        extracted = trafilatura.extract(html, include_comments=False, include_tables=True, include_formatting=False)
        extracted_meta = trafilatura.extract_metadata(html) if extracted else None
        if extracted_meta:
            title = title or extracted_meta.title or None
            metadata.update(_normalize_metadata(extracted_meta))
        content_text = extracted.strip() if extracted else ""
    else:
        content_text = ""

    if partition is not None and len(content_text) < 200:
        try:
            elements = partition(filename=str(path))
            partition_text = "\n".join(
                element.text for element in elements if getattr(element, "text", None)
            ).strip()
            if len(partition_text) > len(content_text):
                content_text = partition_text
        except Exception:
            pass

    links = _extract_links_from_html(html)
    tables = _extract_html_tables(html, max_rows)
    content_markdown = _markdown_from_text(content_text, title)
    content_text = content_text or _plain_text_from_html(html)

    metadata.update({
        "linkCount": len(links),
        "tableCount": len(tables),
    })

    return {
        "title": title or payload.get("title") or path.stem,
        "contentText": content_text.strip(),
        "contentMarkdown": content_markdown,
        "links": links,
        "tables": tables,
        "metadata": metadata,
        "extractor": "html",
    }


def inspect_text_document(path: Path, raw_bytes: bytes, payload: dict[str, Any], kind: str, max_rows: int, file_size: int) -> dict[str, Any]:
    text = raw_bytes.decode("utf-8", errors="ignore").strip()
    metadata: dict[str, Any] = {
        "kind": kind,
        "fileSizeBytes": file_size,
        "sourcePath": str(path),
    }
    content_text = text

    if partition is not None and kind in {"docx", "pptx"}:
        try:
            elements = partition(filename=str(path))
            partition_text = "\n".join(
                element.text for element in elements if getattr(element, "text", None)
            ).strip()
            if partition_text:
                content_text = partition_text
        except Exception:
            pass

    if trafilatura is not None and kind in {"md", "txt"}:
        extracted = trafilatura.extract(text, include_comments=False, include_tables=True, include_formatting=False)
        if extracted:
            content_text = extracted.strip()

    preview = content_text[:20000]
    return {
        "title": payload.get("title") or path.stem,
        "contentText": preview,
        "contentMarkdown": _markdown_from_text(preview, payload.get("title") or path.stem),
        "links": [],
        "tables": [],
        "metadata": metadata,
        "extractor": kind if kind in {"docx", "pptx", "txt", "md"} else "html",
    }


def inspect_tabular(path: Path, raw_bytes: bytes, payload: dict[str, Any], kind: str, max_rows: int, file_size: int) -> dict[str, Any]:
    delimiter = "\t" if kind == "tsv" else None
    kwargs: dict[str, Any] = {
        "dtype": str,
        "keep_default_na": False,
        "nrows": max_rows,
    }
    if delimiter is None:
        kwargs["sep"] = None
        kwargs["engine"] = "python"
    else:
        kwargs["sep"] = delimiter
    frame = pd.read_csv(path, **kwargs)
    return _frame_to_result(frame, path, payload, kind, file_size, notes={"delimiter": delimiter or "auto"})


def inspect_json_like(path: Path, raw_bytes: bytes, payload: dict[str, Any], kind: str, max_rows: int, file_size: int) -> dict[str, Any]:
    if kind in {"jsonl", "ndjson"}:
        frame = pd.read_json(path, lines=True, dtype=False, nrows=max_rows)
    else:
        parsed = json.loads(raw_bytes.decode("utf-8", errors="ignore"))
        if kind == "geojson" and isinstance(parsed, dict) and parsed.get("features"):
            frame = pd.DataFrame([feature.get("properties", {}) | {
                "geometryType": feature.get("geometry", {}).get("type"),
            } for feature in parsed.get("features", [])[:max_rows]])
        elif isinstance(parsed, list):
            frame = pd.DataFrame(parsed[:max_rows])
        elif isinstance(parsed, dict) and isinstance(parsed.get("rows"), list):
            frame = pd.DataFrame(parsed["rows"][:max_rows])
        elif isinstance(parsed, dict):
            frame = pd.DataFrame([parsed])
        else:
            frame = pd.DataFrame([])

    return _frame_to_result(frame, path, payload, kind, file_size, notes={"format": kind})


def inspect_parquet(path: Path, payload: dict[str, Any], max_rows: int, file_size: int) -> dict[str, Any]:
    frame = pd.read_parquet(path)
    return _frame_to_result(frame.head(max_rows), path, payload, "parquet", file_size, notes={"format": "parquet"})


def inspect_excel(path: Path, payload: dict[str, Any], max_rows: int, file_size: int) -> dict[str, Any]:
    sheets = pd.read_excel(path, sheet_name=None)
    tables = []
    frames = []
    for sheet_name, frame in sheets.items():
        preview = frame.head(max_rows)
        tables.append({
            "caption": sheet_name,
            "headers": [str(column) for column in preview.columns.tolist()],
            "rows": preview.astype(str).fillna("").values.tolist(),
        })
        frames.append(preview)

    combined = frames[0] if frames else pd.DataFrame([])
    result = _frame_to_result(combined, path, payload, "excel", file_size, notes={"sheetNames": list(sheets.keys())})
    result["tables"] = tables
    result["metadata"]["sheetNames"] = list(sheets.keys())
    result["metadata"]["sheetCount"] = len(sheets)
    return result


def inspect_xml(path: Path, raw_bytes: bytes, payload: dict[str, Any], kind: str, max_rows: int, file_size: int) -> dict[str, Any]:
    text = raw_bytes.decode("utf-8", errors="ignore")
    root_text = _extract_xml_text(text)
    metadata = {
        "kind": kind,
        "fileSizeBytes": file_size,
        "sourcePath": str(path),
        "format": kind,
    }
    return {
        "title": payload.get("title") or path.stem,
        "contentText": root_text,
        "contentMarkdown": _markdown_from_text(root_text, payload.get("title") or path.stem),
        "links": [],
        "tables": [],
        "metadata": metadata,
        "extractor": kind if kind in {"xml", "sdmx", "xbrl"} else "xml",
    }


def inspect_binary(path: Path, payload: dict[str, Any], kind: str, content_type: str, file_size: int) -> dict[str, Any]:
    notes = [
        f"Unsupported or binary content type: {content_type or 'unknown'}",
        f"File size: {file_size} bytes",
        f"Path: {path}",
    ]
    return {
        "title": payload.get("title") or path.stem,
        "contentText": "\n".join(notes),
        "contentMarkdown": "\n".join(f"- {note}" for note in notes),
        "links": [],
        "tables": [],
        "metadata": {
            "kind": kind,
            "contentType": content_type,
            "fileSizeBytes": file_size,
            "sourcePath": str(path),
        },
        "extractor": kind if kind in {"parquet", "excel", "csv", "json", "jsonl", "geojson"} else "html",
    }


def _frame_to_result(
    frame: pd.DataFrame,
    path: Path,
    payload: dict[str, Any],
    kind: str,
    file_size: int,
    notes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    table = {
        "caption": payload.get("title") or path.stem,
        "headers": [str(column) for column in frame.columns.tolist()],
        "rows": frame.astype(str).fillna("").values.tolist(),
    }
    metadata: dict[str, Any] = {
        "kind": kind,
        "fileSizeBytes": file_size,
        "sourcePath": str(path),
        "rowCount": int(frame.shape[0]),
        "columnCount": int(frame.shape[1]),
        "columns": [str(column) for column in frame.columns.tolist()],
    }
    if notes:
        metadata.update(notes)

    text_lines = [
        f"{payload.get('title') or path.stem}",
        f"Rows: {frame.shape[0]}",
        f"Columns: {frame.shape[1]}",
        "",
        _markdown_table(frame.head(min(10, len(frame)))),
    ]

    return {
        "title": payload.get("title") or path.stem,
        "contentText": "\n".join(text_lines).strip(),
        "contentMarkdown": "\n".join(text_lines).strip(),
        "links": [],
        "tables": [table],
        "metadata": metadata,
        "extractor": kind,
    }


def _stable_row_key(row: dict[str, Any]) -> str:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)


def _numeric_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return pd.DataFrame([])

    numeric_columns: dict[str, pd.Series] = {}
    for column in frame.columns:
        series = pd.to_numeric(frame[column], errors="coerce")
        finite_count = int(np.isfinite(series.to_numpy(dtype=float, na_value=np.nan)).sum())
        if finite_count >= max(2, math.ceil(len(frame) * 0.5)):
            numeric_columns[str(column)] = series

    numeric = pd.DataFrame(numeric_columns)
    if numeric.empty:
        return numeric
    return numeric.replace([np.inf, -np.inf], np.nan).dropna(axis=0, how="any")


def _concat_columns(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    return np.concatenate([left, right], axis=1)


def _least_squares(design: np.ndarray, y: np.ndarray) -> np.ndarray:
    coefficients, *_ = np.linalg.lstsq(design, y, rcond=None)
    return coefficients


def _nearest_centroid(row: np.ndarray, centroids: np.ndarray) -> int:
    distances = np.linalg.norm(centroids - row, axis=1)
    return int(np.argmin(distances))


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_rows(payload: Any) -> list[dict[str, Any]]:
    rows = payload["rows"] if isinstance(payload, dict) and isinstance(payload.get("rows"), list) else payload
    if not isinstance(rows, list):
        raise ValueError("input must be a JSON array or an object with a rows array")
    return [row for row in rows if isinstance(row, dict)]


def _extract_html_title(html: str) -> str | None:
    match = None
    if "<title" in html.lower():
        start = html.lower().find("<title")
        close = html.lower().find("</title>", start)
        if close > start:
            title_block = html[start:close]
            match = title_block.split(">", 1)[-1].strip()
    return match or None


def _extract_links_from_html(html: str) -> list[dict[str, Any]]:
    links = []
    for part in html.split("href=")[1:]:
        quote = part[:1]
        if quote not in {'"', "'"}:
            continue
        url = part[1:].split(quote, 1)[0].strip()
        if not url:
            continue
        links.append({"url": url, "text": ""})
        if len(links) >= 50:
            break
    return links


def _extract_html_tables(html: str, max_rows: int) -> list[dict[str, Any]]:
    # Lightweight fallback that only looks for very simple table markup.
    if "<table" not in html.lower():
        return []
    rows = []
    for row in html.split("<tr")[1:]:
        cells = []
        for cell in row.split("<td")[1:]:
            text = cell.split("</td>", 1)[0]
            text = text.split(">", 1)[-1]
            text = " ".join(text.split())
            cells.append(text)
        if cells:
            rows.append(cells[:20])
        if len(rows) >= max_rows:
            break
    if not rows:
        return []
    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    return [{"caption": "table", "headers": header, "rows": body}]


def _plain_text_from_html(html: str) -> str:
    cleaned = html.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    cleaned = "".join(part for part in cleaned.split("<script")[0:1])
    return " ".join(cleaned.replace("<", " <").split())


def _markdown_from_text(text: str, title: str | None) -> str:
    parts = []
    if title:
        parts.append(f"# {title}")
    if text:
        parts.append(text)
    return "\n\n".join(parts).strip()


def _markdown_table(frame: pd.DataFrame) -> str:
    if frame.empty:
        return ""
    headers = [str(column) for column in frame.columns.tolist()]
    rows = frame.astype(str).fillna("").values.tolist()
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(lines)


def _normalize_metadata(metadata: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in ("title", "description", "author", "date", "sitename", "source_url"):
        value = getattr(metadata, key, None)
        if value:
            result[key] = value
    return result


def _extract_xml_text(text: str) -> str:
    preview = " ".join(text.split())
    return preview[:5000]


if __name__ == "__main__":
    main()
