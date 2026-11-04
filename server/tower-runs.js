import { randomUUID } from 'node:crypto';

export function createTowerRunStore() {
  const runs = new Map();

  return {
    start(userId) {
      const replacedGameIds = [];
      for (const [id, run] of runs) {
        if (run.userId === userId) {
          replacedGameIds.push(...run.gameIds);
          runs.delete(id);
        }
      }

      const run = { id: randomUUID(), userId, floor: 1, lastClear: null, gameIds: [] };
      runs.set(run.id, run);
      return { towerRun: { id: run.id, floor: run.floor }, replacedGameIds };
    },
    get(id, userId) {
      const run = runs.get(id);
      return run?.userId === userId ? run : undefined;
    },
    recordClear(id, userId, floor, gameId, result) {
      const run = this.get(id, userId);
      if (!run) return { error: 'not_found' };
      if (run.lastClear?.floor === floor && run.lastClear.gameId === gameId) {
        return { result: run.lastClear.result, retry: true };
      }
      if (floor !== run.floor) return { error: 'out_of_order' };

      run.lastClear = { floor, gameId, result };
      run.gameIds.push(gameId);
      run.floor += 1;
      return { result, retry: false };
    },
    delete(id, userId) {
      const run = this.get(id, userId);
      if (!run) return false;
      runs.delete(id);
      return run.gameIds;
    },
  };
}
