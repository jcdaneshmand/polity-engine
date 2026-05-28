import type { GameOptions, SoloDifficulty } from "./gameOptions";

export type OptionValidationIssue = { level: "fatal" | "warning"; message: string };
export type OptionValidationReport = { options: GameOptions; issues: OptionValidationIssue[] };

const soloDifficulties = new Set<SoloDifficulty>(["chieftain", "warlord", "imperator", "sovereign", "overlord", "supreme_ruler"]);

export function validateGameOptions(input: GameOptions): OptionValidationReport {
  const options = { ...input, enabledExpansions: [...new Set(input.enabledExpansions)], enabledVariants: [...new Set(input.enabledVariants)] };
  const issues: OptionValidationIssue[] = [];
  if (input.enabledExpansions.length !== options.enabledExpansions.length) issues.push({ level: "warning", message: "Duplicate expansions were normalized." });
  if (input.enabledVariants.length !== options.enabledVariants.length) issues.push({ level: "warning", message: "Duplicate variants were normalized." });
  if (options.mode === "multiplayer" && options.playerCount < 2) issues.push({ level: "fatal", message: "multiplayer mode requires playerCount 2-4." });
  if ((options.mode === "solo" || options.mode === "practice") && options.playerCount !== 1) issues.push({ level: "fatal", message: `${options.mode} mode requires playerCount 1.` });
  if (options.mode !== "solo" && options.soloDifficulty) issues.push({ level: "warning", message: "soloDifficulty ignored outside solo mode." });
  if (options.mode === "solo" && options.soloDifficulty && !soloDifficulties.has(options.soloDifficulty)) {
    issues.push({ level: "fatal", message: `Unknown soloDifficulty: ${String(options.soloDifficulty)}.` });
  }
  if (options.mode === "solo" && !options.soloDifficulty) {
    options.soloDifficulty = "chieftain" as SoloDifficulty;
    issues.push({ level: "warning", message: "soloDifficulty omitted; defaulted to chieftain." });
  }
  if (options.mode === "practice" && options.enabledVariants.includes("short_game")) issues.push({ level: "warning", message: "short_game with practice is unusual." });
  return { options, issues };
}
