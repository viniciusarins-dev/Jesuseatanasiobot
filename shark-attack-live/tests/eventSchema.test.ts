import { describe, expect, it } from "vitest";
import { normalizeCommandText, parseInteractionEvent, sanitizeUsername } from "../src/interactions/eventSchema";

const limits = { maxUsernameLength: 18, maxGiftCount: 50 };

describe("parseInteractionEvent", () => {
  it("aceita os quatro tipos do contrato", () => {
    expect(parseInteractionEvent({ type: "follow", username: "Player123" }, limits)).toEqual({ type: "follow", username: "Player123" });
    expect(parseInteractionEvent({ type: "like", amount: 100 }, limits)).toEqual({ type: "like", amount: 100 });
    expect(parseInteractionEvent({ type: "comment", username: "P", message: "ATAQUE" }, limits)).toEqual({
      type: "comment", username: "P", message: "ATAQUE",
    });
    expect(parseInteractionEvent({ type: "gift", gift: "Rose", username: "P" }, limits)).toEqual({
      type: "gift", username: "P", gift: "rose", count: 1,
    });
  });

  it("rejeita entradas inválidas", () => {
    for (const raw of [null, 42, "x", {}, { type: "hack" }, { type: "like", amount: 0 }, { type: "like", amount: "abc" },
      { type: "gift", username: "a" }, { type: "gift", gift: "  " }, { type: "comment", username: "a" },
      { type: "gift", gift: "rose", count: -1 }]) {
      expect(parseInteractionEvent(raw, limits)).toBeNull();
    }
  });

  it("limita combos e curtidas", () => {
    expect(parseInteractionEvent({ type: "gift", gift: "rose", username: "a", count: 9999 }, limits)).toMatchObject({ count: 50 });
    expect(parseInteractionEvent({ type: "like", amount: 10.7 }, limits)).toMatchObject({ amount: 10 });
  });
});

describe("sanitizeUsername", () => {
  it("remove controle, normaliza espaços e corta sem quebrar emoji", () => {
    expect(sanitizeUsername("  Ana\n\tMaria\u0000 ", 18)).toBe("Ana Maria");
    expect(sanitizeUsername("", 18)).toBe("Anônimo");
    expect(sanitizeUsername(123, 18)).toBe("Anônimo");
    const long = sanitizeUsername("🦈".repeat(30), 5);
    expect(Array.from(long)).toHaveLength(5);
    expect(long.endsWith("…")).toBe(true);
  });
});

it("normaliza comandos (acentos e caixa)", () => {
  expect(normalizeCommandText("atáque!")).toBe("ATAQUE!");
});
