// Graded exercises for the playing-sample assessment. Notes stay on the on-screen piano (C4-B4).
export type LevelExercise = { id: string; name: string; melody: readonly number[]; tempo: number; difficulty: number };

export const LEVEL_EXERCISES: readonly LevelExercise[] = [
  { id: "ladder-1", name: "Steps", melody: [60, 62, 64, 62, 60, 62, 64, 65], tempo: 60, difficulty: 700 },
  { id: "ladder-2", name: "Scale up and down", melody: [60, 62, 64, 65, 67, 65, 64, 62], tempo: 72, difficulty: 950 },
  { id: "ladder-3", name: "Skips", melody: [60, 64, 62, 65, 64, 67, 65, 69, 67, 64], tempo: 80, difficulty: 1200 },
  { id: "ladder-4", name: "Wide leaps", melody: [60, 67, 62, 69, 64, 71, 65, 69, 67, 60], tempo: 92, difficulty: 1450 },
  { id: "ladder-5", name: "Fast and angular", melody: [71, 60, 69, 62, 67, 64, 65, 67, 64, 69, 62, 71], tempo: 104, difficulty: 1700 },
];

/** Stop the ladder when accuracy falls below this percentage. */
export const LADDER_STOP_ACCURACY = 60;

export const exerciseById = (id: string) => LEVEL_EXERCISES.find((e) => e.id === id);
export const beatMs = (tempo: number) => 60000 / tempo;
