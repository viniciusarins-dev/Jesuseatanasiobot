/**
 * Ranking de participantes. O MVP guarda em memória; para usar banco de dados
 * depois, basta outra classe que implemente `LeaderboardStore`.
 */

export interface LeaderboardEntry {
  username: string;
  points: number;
  interactions: number;
  lastSeen: number;
}

export interface LeaderboardStore {
  addPoints(username: string, points: number, now: number): void;
  top(limit: number): LeaderboardEntry[];
  get(username: string): LeaderboardEntry | undefined;
}

export class InMemoryLeaderboardStore implements LeaderboardStore {
  private readonly entries = new Map<string, LeaderboardEntry>();

  /** Limite de usuários guardados (protege a memória numa LIVE longa). */
  constructor(private readonly maxEntries = 5000) {}

  addPoints(username: string, points: number, now: number): void {
    const key = username.toLowerCase();
    const entry = this.entries.get(key);
    if (entry) {
      entry.points += points;
      entry.interactions += 1;
      entry.lastSeen = now;
      return;
    }
    if (this.entries.size >= this.maxEntries) this.evictWeakest();
    this.entries.set(key, { username, points, interactions: 1, lastSeen: now });
  }

  top(limit: number): LeaderboardEntry[] {
    return [...this.entries.values()]
      .sort((a, b) => b.points - a.points || b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }

  get(username: string): LeaderboardEntry | undefined {
    return this.entries.get(username.toLowerCase());
  }

  private evictWeakest(): void {
    let weakestKey: string | null = null;
    let weakest: LeaderboardEntry | null = null;
    for (const [key, e] of this.entries) {
      if (!weakest || e.points < weakest.points || (e.points === weakest.points && e.lastSeen < weakest.lastSeen)) {
        weakest = e;
        weakestKey = key;
      }
    }
    if (weakestKey) this.entries.delete(weakestKey);
  }
}
