import { expect, it } from "vitest";
import { InMemoryLeaderboardStore } from "../src/store/LeaderboardStore";

it("agrupa sem diferenciar maiúsculas e ordena por pontos", () => {
  const store = new InMemoryLeaderboardStore();
  store.addPoints("Ana", 5, 1);
  store.addPoints("ana", 5, 2);
  store.addPoints("Bia", 7, 3);
  expect(store.top(5)).toMatchObject([{ username: "Ana", points: 10, interactions: 2 }, { username: "Bia", points: 7 }]);
});

it("tem limite de memória", () => {
  const store = new InMemoryLeaderboardStore(3);
  store.addPoints("a", 10, 1);
  store.addPoints("b", 1, 2);
  store.addPoints("c", 5, 3);
  store.addPoints("d", 4, 4);
  expect(store.top(10).map((e) => e.username)).toEqual(["a", "c", "d"]);
});
