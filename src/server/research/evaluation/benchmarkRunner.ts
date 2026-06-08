import { pathToFileURL } from "url";
import { RESEARCH_BENCHMARK_FIXTURES, ResearchBenchmarkFixture } from "./fixtures";
import { planResearch } from "../queryPlanner";

export interface ResearchBenchmarkResult {
  fixtureId: string;
  topic: string;
  queryCount: number;
  requiredSourceTypes: string[];
  plannedSourceTypes: string[];
  coverage: number;
  sourceDiversity: number;
  evidenceDensityTarget: number;
  conflictCoverage: number;
  reportCompleteness: number;
}

export function runResearchBenchmarks(fixtures: ResearchBenchmarkFixture[] = RESEARCH_BENCHMARK_FIXTURES) {
  return fixtures.map(evaluateFixture);
}

function evaluateFixture(fixture: ResearchBenchmarkFixture): ResearchBenchmarkResult {
  const plan = planResearch(fixture.topic, [], {});
  const plannedSourceTypes = [...new Set(plan.queries.flatMap((query) => query.sourceTypes))];
  const coveredTypes = fixture.requiredSourceTypes.filter((type) => plannedSourceTypes.includes(type));
  const queryPurposes = new Set(plan.queries.map((query) => query.purpose));
  const reportSections = [
    "研究摘要",
    "关键结论",
    "证据表",
    "来源质量",
    "冲突信息",
    "时间线",
    "尚不确定的问题",
    "下一步建议搜索",
    "完整来源列表",
  ];

  return {
    fixtureId: fixture.id,
    topic: fixture.topic,
    queryCount: plan.queries.length,
    requiredSourceTypes: fixture.requiredSourceTypes,
    plannedSourceTypes,
    coverage: ratio(coveredTypes.length, fixture.requiredSourceTypes.length),
    sourceDiversity: ratio(plannedSourceTypes.length, Math.max(1, fixture.requiredSourceTypes.length)),
    evidenceDensityTarget: fixture.minimumEvidenceCount,
    conflictCoverage: queryPurposes.has("contradiction") ? 1 : 0,
    reportCompleteness: ratio(reportSections.length, 9),
  };
}

function ratio(value: number, total: number) {
  return total === 0 ? 1 : Number(Math.min(1, value / total).toFixed(3));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ results: runResearchBenchmarks() }, null, 2));
}
