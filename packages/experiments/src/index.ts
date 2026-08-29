export type BriefingVariant = "risk-first" | "agenda-first";

export type ExperimentDefinition<TVariant extends string> = {
  key: string;
  variants: readonly TVariant[];
  allocation: readonly number[];
  active: boolean;
};

export const briefingPriorityExperiment: ExperimentDefinition<BriefingVariant> = {
  key: "home_briefing_priority_v1",
  variants: ["risk-first", "agenda-first"],
  allocation: [50, 50],
  active: true,
};

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assignVariant<TVariant extends string>(
  experiment: ExperimentDefinition<TVariant>,
  subjectId: string,
): TVariant {
  if (experiment.variants.length === 0) throw new Error("Experiment needs at least one variant");
  const bucket = fnv1a(`${experiment.key}:${subjectId}`) % 100;
  let ceiling = 0;
  for (let index = 0; index < experiment.variants.length; index += 1) {
    ceiling += experiment.allocation[index] ?? 0;
    if (bucket < ceiling) return experiment.variants[index] as TVariant;
  }
  return experiment.variants[0] as TVariant;
}
