import { getItemEffects } from '../items.js';

const winningOutcomes = ['player_blackjack', 'player_win', 'dealer_bust'];
const losingOutcomes = ['dealer_blackjack', 'player_bust', 'dealer_win'];

export function outcomeMessage(outcome) {
  const messages = {
    player_blackjack: 'Blackjack! You win the hand.',
    dealer_blackjack: 'The monster wins the hand.',
    player_bust: 'Bust! The monster wins the hand.',
    dealer_bust: 'The monster busts. You win the hand!',
    player_win: 'You win the hand!',
    dealer_win: 'The monster wins the hand.',
    push: 'Push. No damage dealt.',
  };
  return messages[outcome] ?? 'Your hand is in play.';
}

export function resolveCombatRound(gameState, {
  runState,
  currentStats,
  currentMonster,
  maximumHealth,
  removeDungeonSession,
  syncStageClear,
  onDungeonSessionRemovalError,
  onStageClearError,
}) {
  if (
    !runState
    || runState.phase !== 'active'
    || gameState.status !== 'complete'
    || gameState.id === runState.lastResolvedGameId
  ) {
    return;
  }

  if (winningOutcomes.includes(gameState.outcome)) {
    const itemEffects = getItemEffects(runState.items);
    const baseDamage = Math.max(
      1,
      gameState.playerScore + currentStats.strength + itemEffects.attack - currentMonster().defense,
    )
      * (gameState.doubledDown ? 2 : 1);
    const criticalChance = Math.min(100, currentStats.luck * 3 + itemEffects.criticalChance * 100);
    const criticalHit = Math.random() * 100 < criticalChance;
    const hitMultiplier = gameState.hitCount > 0
      ? gameState.hitMultiplier + itemEffects.hitMultiplier
      : 1;
    const wager = runState.activeWager;
    const wagerMultiplier = 1 + (wager?.percentage ?? 0) * 2;
    const damage = Math.floor(
      baseDamage * hitMultiplier * wagerMultiplier * (criticalHit ? 1.5 : 1),
    );
    runState.monsterHp = Math.max(0, runState.monsterHp - damage);
    runState.lastDamageEvent = {
      gameId: gameState.id,
      damage,
      hitCount: gameState.hitCount,
      hitMultiplier,
    };
    const healing = Math.min(
      maximumHealth() - runState.playerHp,
      Math.ceil(
        (
          maximumHealth() * itemEffects.healOnHitHpBased
          + damage * itemEffects.healOnHitDamageBased
        ) * (1 + itemEffects.healing),
      ),
    );
    runState.playerHp += healing;
    const hitMessage = criticalHit
      ? `Critical hit! You deal ${damage} damage.`
      : `You deal ${damage} damage.`;
    const doubleDownMessage = gameState.doubledDown ? ' Double down doubles your attack!' : '';
    const wagerMessage = wager
      ? ` Your ${wager.hpStake} HP wager adds ${wager.percentage * 200}% damage.`
      : '';
    runState.lastRoundMessage = healing > 0
      ? `${hitMessage}${doubleDownMessage}${wagerMessage} Your items restore ${healing} HP.`
      : `${hitMessage}${doubleDownMessage}${wagerMessage}`;
    if (runState.monsterHp === 0) {
      runState.phase = 'clearing';
      runState.pendingStageClear = { stage: runState.stage, gameId: gameState.id };
    }
  } else if (losingOutcomes.includes(gameState.outcome)) {
    const itemEffects = getItemEffects(runState.items);
    const baseDamage = gameState.dealerScore + currentMonster().attackPower;
    const damage = Math.floor(baseDamage * (1 - itemEffects.damageReduction))
      * (gameState.doubledDown ? 2 : 1);
    const dodgeChance = Math.min(100, currentStats.agility * 5 + itemEffects.dodgeChance * 100);
    const wagerMessage = runState.activeWager
      ? ` Your ${runState.activeWager.hpStake} HP wager was already spent.`
      : '';
    if (Math.random() * 100 < dodgeChance) {
      runState.lastRoundMessage = `You dodge the monster's ${damage}-damage attack.${gameState.doubledDown ? ' Double down doubles the damage you would take.' : ''}${wagerMessage}`;
    } else {
      runState.playerHp = Math.max(0, runState.playerHp - damage);
      const reflectedDamage = Math.min(
        runState.monsterHp,
        Math.floor(damage * itemEffects.damageReflection),
      );
      runState.monsterHp -= reflectedDamage;
      const reflectionMessage = reflectedDamage > 0
        ? ` Your gear reflects ${reflectedDamage} damage.`
        : '';
      runState.lastRoundMessage = gameState.doubledDown
        ? `The monster deals ${damage} damage to you. Double down doubles the damage you take.${reflectionMessage}${wagerMessage}`
        : `The monster deals ${damage} damage to you.${reflectionMessage}${wagerMessage}`;
    }
    if (runState.playerHp === 0) {
      runState.phase = 'failed';
      runState.items = [];
      removeDungeonSession(runState.dungeonId, gameState.id).catch((error) => {
        onDungeonSessionRemovalError(error, runState);
      });
    } else if (runState.monsterHp === 0) {
      runState.phase = 'clearing';
      runState.pendingStageClear = { stage: runState.stage, gameId: gameState.id };
    }
  } else {
    runState.lastRoundMessage = 'No damage dealt.';
  }

  runState.lastResolvedGameId = gameState.id;
  if (runState.pendingStageClear) {
    syncStageClear().catch((error) => {
      onStageClearError(error, runState);
    });
  }
}
