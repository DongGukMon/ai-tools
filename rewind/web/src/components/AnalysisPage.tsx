import {
  Sparkles,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import type { AnalysisData } from "../types";

interface Props {
  data: AnalysisData | null;
  backend?: string;
}

const qualityColors = {
  good: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  fair: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  poor: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

const impactColors = {
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-slate-500 dark:text-neutral-400",
  negative: "text-red-600 dark:text-red-400",
};

export default function AnalysisPage({ data, backend }: Props) {
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 flex justify-center">
        <div className="liquid-glass rounded-2xl p-8 text-center max-w-md">
          <Sparkles className="w-8 h-8 text-violet-500 dark:text-violet-400 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-neutral-200 mb-2">
            AI Analysis
          </h3>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mb-5">
            Generate an AI-powered analysis of this session to get prompt quality reviews,
            strategy critique, and actionable takeaways.
          </p>
          <div className="text-left bg-slate-100/80 dark:bg-neutral-900/60 rounded-xl p-4 font-mono text-xs text-slate-600 dark:text-neutral-400">
            <span className="text-slate-400 dark:text-neutral-600">$</span>{" "}
            {backend === "codex" ? "$rewind-analyze" : "/rewind-analyze"}
          </div>
          <p className="mt-3 text-[10px] text-slate-400 dark:text-neutral-600">
            Run this skill in {backend === "codex" ? "Codex" : "Claude Code"}, then re-export the viewer to see results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
      {/* Prompt Reviews */}
      {data.promptReviews.length > 0 && (
        <div className="liquid-glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200">
              Prompt Reviews
            </h3>
          </div>
          <div className="space-y-3">
            {data.promptReviews.map((pr, i) => (
              <div
                key={i}
                className="rounded-xl bg-white/30 dark:bg-white/5 border border-slate-200/40 dark:border-neutral-700/30 p-3"
              >
                <div className="flex items-start gap-2 mb-2">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${qualityColors[pr.quality]}`}
                  >
                    {pr.quality}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-600">
                    line #{pr.eventIndex}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-neutral-400 font-mono mb-1.5 line-clamp-2">
                  "{pr.promptSnippet}"
                </p>
                <p className="text-xs text-slate-700 dark:text-neutral-300">{pr.feedback}</p>
                {pr.suggestion && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                    <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{pr.suggestion}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategy Critique */}
      <div className="liquid-glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200">
            Strategy Critique
          </h3>
        </div>
        <p className="text-xs text-slate-700 dark:text-neutral-300 mb-3">
          {data.strategyCritique.summary}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.strategyCritique.strengths.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Strengths
              </span>
              <ul className="mt-1 space-y-1">
                {data.strategyCritique.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-neutral-400">
                    <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.strategyCritique.weaknesses.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                Weaknesses
              </span>
              <ul className="mt-1 space-y-1">
                {data.strategyCritique.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-neutral-400">
                    <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {data.strategyCritique.alternativeApproach && (
          <div className="mt-3 p-2.5 rounded-lg bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/40 dark:border-violet-800/30">
            <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
              Alternative Approach
            </span>
            <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">
              {data.strategyCritique.alternativeApproach}
            </p>
          </div>
        )}
      </div>

      {/* Key Decisions */}
      {data.keyDecisions.length > 0 && (
        <div className="liquid-glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
            Key Decisions
          </h3>
          <div className="space-y-2">
            {data.keyDecisions.map((d, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-xs rounded-lg px-3 py-2 bg-white/30 dark:bg-white/5 border border-slate-200/40 dark:border-neutral-700/30"
              >
                <span className={`font-medium shrink-0 ${impactColors[d.impact]}`}>
                  {d.impact === "positive" ? "+" : d.impact === "negative" ? "-" : "~"}
                </span>
                <div>
                  <p className="text-slate-700 dark:text-neutral-300">{d.description}</p>
                  <p className="mt-0.5 text-slate-500 dark:text-neutral-500">{d.reasoning}</p>
                </div>
                <span className="ml-auto text-[10px] text-slate-400 dark:text-neutral-600 shrink-0">
                  line #{d.eventIndex}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Takeaways */}
      {data.takeaways.length > 0 && (
        <div className="liquid-glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-neutral-200 mb-4">
            Actionable Takeaways
          </h3>
          <ol className="space-y-2">
            {data.takeaways.map((t, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-xs"
              >
                <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 font-medium">
                  {i + 1}
                </span>
                <span className="text-slate-700 dark:text-neutral-300 pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-[10px] text-slate-400 dark:text-neutral-600">
        Generated {new Date(data.generatedAt).toLocaleString()} by {data.model}
      </p>
    </div>
  );
}
