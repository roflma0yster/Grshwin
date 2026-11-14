import { describe, expect, it } from "vitest";
import { DAILY_MINUTES, GENRES, GOALS, INPUT_METHODS, ONBOARDING_DEFAULTS, answersFromProfile, completeAnswers, profilePayload } from "@/lib/onboarding";
import { LEVEL_BANDS } from "@/lib/rating";

describe("skipping the questionnaire", () => {
  it("fills every question with the defaults when nothing was answered", () => {
    expect(completeAnswers({})).toEqual(ONBOARDING_DEFAULTS);
  });
  it("keeps the answers already given and defaults only the rest", () => {
    expect(completeAnswers({ genre: "Jazz", daily_minutes: "45" })).toEqual({ ...ONBOARDING_DEFAULTS, genre: "Jazz", daily_minutes: 45 });
  });
  it("keeps a complete set of answers exactly as given", () => {
    const full = { genre: "Pop", proficiency: "Intermediate", goal: "Performance", daily_minutes: "60", input_method: "Acoustic" };
    expect(completeAnswers(full)).toEqual({ genre: "Pop", proficiency: "Intermediate", goal: "Performance", daily_minutes: 60, input_method: "Acoustic" });
  });
  it("treats unrecognised or blank answers as unanswered", () => {
    expect(completeAnswers({ genre: "Polka", goal: "", daily_minutes: "twenty", input_method: "Kazoo", proficiency: "   " })).toEqual(ONBOARDING_DEFAULTS);
    expect(completeAnswers({ daily_minutes: "37" }).daily_minutes).toBe(ONBOARDING_DEFAULTS.daily_minutes);
  });
  it("has defaults that are real choices in the questionnaire and a known level", () => {
    expect(GENRES).toContain(ONBOARDING_DEFAULTS.genre);
    expect(GOALS).toContain(ONBOARDING_DEFAULTS.goal);
    expect(INPUT_METHODS).toContain(ONBOARDING_DEFAULTS.input_method);
    expect(DAILY_MINUTES).toContain(ONBOARDING_DEFAULTS.daily_minutes);
    expect(LEVEL_BANDS.map((b) => b.label)).toContain(ONBOARDING_DEFAULTS.proficiency);
  });
});

describe("the saved profile", () => {
  it("marks the player as onboarded so the app stops sending them back", () => {
    const row = profilePayload("user-1", {});
    expect(row.onboarded).toBe(true);
    expect(row.id).toBe("user-1");
    expect(typeof row.daily_minutes).toBe("number");
  });
  it("always writes a complete row, with no empty values", () => {
    for (const answers of [{}, { genre: "Blues" }, { goal: "Fun", daily_minutes: "15" }]) {
      const row = profilePayload("u", answers);
      expect(Object.values(row).every((v) => v !== null && v !== undefined && v !== "")).toBe(true);
    }
  });
});

describe("coming back to the questionnaire", () => {
  it("turns an existing profile into answers", () => {
    expect(answersFromProfile({ genre: "Jazz", proficiency: "Intermediate", goal: "Fun", daily_minutes: 45, input_method: "Digital" })).toEqual({ genre: "Jazz", proficiency: "Intermediate", goal: "Fun", daily_minutes: "45", input_method: "Digital" });
  });
  it("leaves out anything the profile does not have", () => {
    expect(answersFromProfile({ genre: null, proficiency: null, goal: null, daily_minutes: null, input_method: null })).toEqual({});
    expect(answersFromProfile(null)).toEqual({});
    expect(answersFromProfile(undefined)).toEqual({});
  });
  it("keeps a zero-minute value rather than dropping it", () => {
    expect(answersFromProfile({ genre: null, proficiency: null, goal: null, daily_minutes: 0, input_method: null })).toEqual({ daily_minutes: "0" });
  });
  it("never wipes an existing profile: skipping after prefill returns the same values", () => {
    const profile = { genre: "Pop", proficiency: "Upper Intermediate", goal: "Exam prep", daily_minutes: 60, input_method: "Acoustic" };
    expect(completeAnswers(answersFromProfile(profile))).toEqual(profile);
  });
});
