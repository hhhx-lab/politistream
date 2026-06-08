# PolitiStream Analytics Worker

This worker lane is the Python side of PolitiStream's Data Lab. It is designed to run heavy analytics outside the Node/Express API process.

## Environment

Use an isolated project environment. Do not use `sudo pip` and do not mix system/Homebrew Python with this project.

```bash
cd workers-analytics
uv sync --python 3.12
uv sync --extra ml --extra reports --python 3.12
```

最小环境可只运行第一条；完整 Data Lab 推荐运行第二条，以启用 PyTorch、Transformers、sentence-transformers、SHAP 和 python-pptx。

## CLI

The current CLI can profile JSON rows, produce descriptive statistics, run data quality checks, build SPSS-style tables/tests/models, organize news, analyze text, produce publication charts, and export Chinese research reports:

```bash
.venv/bin/python -m politistream_analytics.worker profile --input sample-rows.json --output profile.json
.venv/bin/python -m politistream_analytics.worker stats --input sample-rows.json --output stats.json
.venv/bin/python -m politistream_analytics.worker quality --input sample-rows.json --output quality.json
.venv/bin/python -m politistream_analytics.worker frequency --input sample-rows.json --output frequency.json
.venv/bin/python -m politistream_analytics.worker crosstab --input sample-rows.json --output crosstab.json
.venv/bin/python -m politistream_analytics.worker tests --input sample-rows.json --output tests.json
.venv/bin/python -m politistream_analytics.worker regression --input sample-rows.json --output regression.json
.venv/bin/python -m politistream_analytics.worker logistic --input sample-rows.json --output logistic.json
.venv/bin/python -m politistream_analytics.worker poisson --input sample-rows.json --output poisson.json
.venv/bin/python -m politistream_analytics.worker dimension --input sample-rows.json --output dimension.json
.venv/bin/python -m politistream_analytics.worker cluster --input sample-rows.json --output cluster.json
.venv/bin/python -m politistream_analytics.worker anomaly --input sample-rows.json --output anomaly.json
.venv/bin/python -m politistream_analytics.worker timeseries --input sample-rows.json --output timeseries.json
.venv/bin/python -m politistream_analytics.worker cleaning --input sample-rows.json --output cleaning.json
.venv/bin/python -m politistream_analytics.worker news --input sample-rows.json --output news.json
.venv/bin/python -m politistream_analytics.worker text --input sample-rows.json --output text.json
.venv/bin/python -m politistream_analytics.worker explain --input sample-rows.json --output explain.json
.venv/bin/python -m politistream_analytics.worker deepml --input sample-rows.json --output deepml.json
.venv/bin/python -m politistream_analytics.worker geo --input sample-rows.json --output geo.json
.venv/bin/python -m politistream_analytics.worker chart --input sample-rows.json --output chart.json
.venv/bin/python -m politistream_analytics.worker report --input sample-rows.json --output report.json
.venv/bin/python -m politistream_analytics.worker export --input sample-rows.json --output export.json
```

`chart` writes PNG/SVG/PDF plus Plotly HTML/JSON, Mermaid, Graphviz DOT, and interactive JSON specs to `ANALYTICS_ARTIFACT_DIR`. `export` writes Markdown, HTML, DOCX, PDF, PPTX, and JSON reports; it prefers the local Codex document toolchain when available and uses python-pptx for richer PPTX output.

The dependency list prepares the lane for DuckDB, Pandas, Polars, SciPy, statsmodels, scikit-learn, PyTorch, Transformers, sentence-transformers, SHAP, Matplotlib, Seaborn, Plotly, data quality checks, and report generation. Data Lab stores full imported rows for worker analysis while keeping only preview rows in the browser-facing dataset list.

Run the full worker smoke from the repo root:

```bash
npm run test:analytics-worker
```

## Contract

Input rows are JSON arrays:

```json
[
  { "source": "Reuters", "count": 12, "date": "2026-06-01" },
  { "source": "AP", "count": 8, "date": "2026-06-02" }
]
```

Outputs are JSON artifacts that can be saved into `analytics_artifacts` by the Node side.
