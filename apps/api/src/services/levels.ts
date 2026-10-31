export function levelForXp(totalXp: number): { level: number; currentLevelXp: number; nextLevelXp: number; progress: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1;
  const currentLevelXp = (level - 1) ** 2 * 100;
  const nextLevelXp = level ** 2 * 100;
  return { level, currentLevelXp, nextLevelXp, progress: Math.min(100, Math.floor((totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp) * 100)) };
}
