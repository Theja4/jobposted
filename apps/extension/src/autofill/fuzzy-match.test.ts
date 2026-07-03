import { describe, expect, it } from "vitest";
import { bestMatch, DEFAULT_FUZZY_THRESHOLD, fuzzyScore } from "./fuzzy-match";

const DEGREE_OPTIONS = [
  "Doctorate degree (e.g. PhD, PsyD, EdD, JD)",
  "Masters degree (e.g. MBA, MA, MS, Meng)",
  "Three to Four year University Bachelors degree (e.g. BA, BS)",
  "Joint: Three to Four year University Bachelors degree (e.g. BA, BS)",
  "Major: Three to Four year University Bachelors degree (e.g. BA, BS)",
];

const SIMPLE_DEGREE_OPTIONS = [
  "Select One",
  "Associates",
  "Honours Bachelor",
  "Bachelors",
  "Honours Master",
  "Masters",
  "Doctorate",
  "Certificate",
  "High School",
];

const FIELD_OF_STUDY_OPTIONS = [
  "Computer and Information Science",
  "Computer Engineering",
  "Computer Graphics",
  "Computer Systems Analysis",
];

describe("fuzzyScore", () => {
  it("scores an exact (case/spacing-insensitive) match as 1", () => {
    expect(fuzzyScore("Computer Science", "computer science")).toBe(1);
    expect(fuzzyScore("React", "react")).toBe(1);
  });

  it("rewards a subset phrase over a sibling that only shares one token", () => {
    const subset = fuzzyScore("Computer Science", "Computer and Information Science");
    const sibling = fuzzyScore("Computer Science", "Computer Engineering");
    expect(subset).toBeGreaterThan(sibling);
    expect(subset).toBeGreaterThan(0.8);
  });

  it("ignores parenthetical examples and plural drift on degrees", () => {
    // "Bachelor's Degree" vs "...Bachelors degree (e.g. BA, BS)" should read as a strong match.
    expect(fuzzyScore("Bachelor's Degree", "Three to Four year University Bachelors degree (e.g. BA, BS)")).toBeGreaterThan(
      DEFAULT_FUZZY_THRESHOLD,
    );
  });

  it("does not treat an honours bachelor as a plain bachelor's degree", () => {
    expect(fuzzyScore("Bachelor's Degree", "Honours Bachelor")).toBeLessThan(DEFAULT_FUZZY_THRESHOLD);
    expect(fuzzyScore("Master's Degree", "Honours Master")).toBeLessThan(DEFAULT_FUZZY_THRESHOLD);
  });
});

describe("bestMatch — controlled-vocabulary selection", () => {
  it("maps 'Computer Science' to 'Computer and Information Science'", () => {
    const match = bestMatch("Computer Science", FIELD_OF_STUDY_OPTIONS, (option) => option);
    expect(match?.option).toBe("Computer and Information Science");
  });

  it("maps a plain 'Bachelor's Degree' to the plain Bachelors option, not Joint/Major variants", () => {
    const match = bestMatch("Bachelor's Degree", DEGREE_OPTIONS, (option) => option);
    expect(match?.option).toBe("Three to Four year University Bachelors degree (e.g. BA, BS)");
  });

  it.each([
    ["Bachelor of Technology B.Tech", "Bachelors"],
    ["B.E.", "Bachelors"],
    ["BCA", "Bachelors"],
    ["M.Tech", "Masters"],
    ["Master of Technology M.Tech", "Masters"],
    ["MCA", "Masters"],
    ["M.Com", "Masters"],
    ["MBA", "Masters"],
    ["PhD", "Doctorate"],
    ["Associate of Science", "Associates"],
    ["Postgraduate Diploma", "Certificate"],
    ["Higher Secondary", "High School"],
  ])("maps '%s' to '%s'", (target, expected) => {
    const match = bestMatch(target, SIMPLE_DEGREE_OPTIONS, (option) => option);
    expect(match?.option).toBe(expected);
  });

  it("maps 'Master's Degree' to the Masters option", () => {
    const match = bestMatch("Master's Degree", DEGREE_OPTIONS, (option) => option);
    expect(match?.option).toBe("Masters degree (e.g. MBA, MA, MS, Meng)");
  });

  it("picks the nearest engineering discipline when there is no exact option", () => {
    // "Electronics and Communication Engineering" is not offered; "Electrical Engineering" is the closest.
    const match = bestMatch(
      "Electronics and Communication Engineering",
      ["Electrical Engineering", "Computer Engineering", "Mechanical Engineering", "Computer Science"],
      (option) => option,
    );
    expect(match?.option).toBe("Electrical Engineering");
  });

  it("recovers a skill from a near-spelling", () => {
    const match = bestMatch("Reactjs", ["React", "Redux", "Angular"], (option) => option);
    expect(match?.option).toBe("React");
  });

  it("returns null rather than guessing when nothing is close", () => {
    const match = bestMatch("Underwater Basket Weaving", FIELD_OF_STUDY_OPTIONS, (option) => option);
    expect(match).toBeNull();
  });
});
