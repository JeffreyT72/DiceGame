import { getTowerEncounter, getTowerFloorInBlock } from '../../../shared/tower-config.js';

export function createInfiniteTowerMode({ request }) {
  function createRunState(run, level, maximumHealth) {
    const encounter = getTowerEncounter(run.floor);
    return {
      dungeonId: run.id,
      mode: 'tower',
      dungeon: { name: 'Infinite Tower' },
      suggestedLevel: level,
      stage: run.floor,
      playerHp: maximumHealth,
      monsterHp: encounter.monster.hp,
      lastResolvedGameId: null,
      lastRoundMessage: '',
      lastExpAwarded: 0,
      phase: 'active',
      pendingStageClear: null,
      items: [],
    };
  }

  return {
    createRunState,
    getEncounter: getTowerEncounter,
    getFloorInBlock: getTowerFloorInBlock,
    getMonster: (runState) => getTowerEncounter(runState.stage)?.monster,
    getStageCount: () => 10,
    isBoss: (runState) => Boolean(getTowerEncounter(runState.stage)?.boss),
    getRunEndpoint: (runId) => `/api/tower-runs/${encodeURIComponent(runId)}`,
    clearFloor: (runState, stage, gameId) => request(
      `/api/tower-runs/${encodeURIComponent(runState.dungeonId)}/clear-floor`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor: stage, gameId }),
      },
    ),
    async begin({
      level,
      maximumHealth,
      setRunState,
      setBattleMode,
      renderBattlefield,
      renderControls,
      setStatus,
    }) {
      renderControls();
      setStatus('Opening the Infinite Tower…');
      try {
        const { towerRun } = await request('/api/tower-runs', { method: 'POST' });
        setRunState(createRunState(towerRun, level, maximumHealth));
        setBattleMode();
        renderBattlefield();
        renderControls();
        setStatus('Choose an HP wager or skip to start your hand.');
      } catch (error) {
        console.error(error);
        setStatus(`Could not enter the tower: ${error.message}`);
      }
    },
    async start({ towerButton, quitButton, showDungeon, ensureGame, begin }) {
      towerButton.disabled = true;
      quitButton.disabled = true;
      try {
        showDungeon();
        ensureGame();
        await begin();
      } finally {
        towerButton.disabled = false;
        quitButton.disabled = false;
      }
    },
  };
}
