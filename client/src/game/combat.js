import { getItemEffects } from '../../../shared/items.js';
import { getCombatHandModifiers } from '../../../shared/combat-rules.js';

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

  runState.playerHp = Math.round(runState.playerHp);
  runState.monsterHp = Math.round(runState.monsterHp);

  const hands = gameState.playerHands?.map((hand) => ({
    ...gameState,
    playerHand: hand.cards,
    playerScore: hand.score,
    hitCount: hand.hitCount,
    hitMultiplier: hand.hitMultiplier,
    doubledDown: hand.doubledDown,
    outcome: hand.outcome,
  })) ?? [gameState];
  const messages = [];

  for (const hand of hands) {
    if (winningOutcomes.includes(hand.outcome)) {
      const itemEffects = getItemEffects(runState.items);
      const handModifiers = getCombatHandModifiers(hand.playerHand, hand.hitCount);
      const baseDamage = Math.max(
        1,
        hand.playerScore + currentStats.strength + itemEffects.attack - currentMonster().defense,
      ) * (hand.doubledDown ? 2 : 1);
      const criticalChance = Math.min(100, currentStats.luck * 3 + itemEffects.criticalChance * 100);
      const criticalHit = Math.random() * 100 < criticalChance;
      const hitMultiplier = hand.hitCount > 0
        ? hand.hitMultiplier + itemEffects.hitMultiplier
        : 1;
      const pairMultiplier = handModifiers.matchingPair ? 1.5 : 1;
      const fiveCardMultiplier = handModifiers.fiveCardHand ? 2 : 1;
      const wager = runState.activeWager;
      const maxHealth = Math.round(maximumHealth());
      const damage = Math.floor(
        baseDamage * hitMultiplier * pairMultiplier * fiveCardMultiplier
          * (1 + (wager?.percentage ?? 0) * 2) * (criticalHit ? 1.5 : 1),
      );
      runState.monsterHp = Math.max(0, runState.monsterHp - damage);
      runState.lastDamageEvent = {
        gameId: gameState.id,
        damage,
        hitCount: hand.hitCount,
        hitMultiplier,
        matchingPair: handModifiers.matchingPair,
        fiveCardHand: handModifiers.fiveCardHand,
        doubledDown: Boolean(hand.doubledDown),
        criticalHit,
        wagerPercentage: wager?.percentage ?? 0,
        itemAttack: itemEffects.attack,
        healed: 0,
      };
      const healing = Math.min(
        maxHealth - runState.playerHp,
        Math.ceil(
          (
            maxHealth * itemEffects.healOnHitHpBased
            + damage * itemEffects.healOnHitDamageBased
          ) * (1 + itemEffects.healing),
        ),
      );
      runState.playerHp = Math.round(runState.playerHp + healing);
      runState.lastDamageEvent.healed = healing;
      const hitMessage = criticalHit
        ? `Critical hit! You deal ${damage} damage.`
        : `You deal ${damage} damage.`;
      const pairMessage = handModifiers.matchingPair ? ' Matching opening cards deal 1.5x damage.' : '';
      const fiveCardMessage = handModifiers.fiveCardHand
        ? ' Five cards without busting deal 2x damage.'
        : '';
      const doubleDownMessage = hand.doubledDown ? ' Double down doubles your attack!' : '';
      const wagerMessage = wager
        ? ` Your ${wager.hpStake} HP wager adds ${wager.percentage * 200}% damage.`
        : '';
      messages.push(healing > 0
        ? `${hitMessage}${pairMessage}${fiveCardMessage}${doubleDownMessage}${wagerMessage} Your items restore ${healing} HP.`
        : `${hitMessage}${pairMessage}${fiveCardMessage}${doubleDownMessage}${wagerMessage}`);
    } else if (losingOutcomes.includes(hand.outcome)) {
      const itemEffects = getItemEffects(runState.items);
      const handModifiers = getCombatHandModifiers(hand.playerHand, hand.hitCount);
      const baseDamage = hand.dealerScore + currentMonster().attackPower;
      const damage = Math.floor(
        baseDamage * (1 - itemEffects.damageReduction) * (handModifiers.noHit ? 0.5 : 1),
      ) * (hand.doubledDown ? 2 : 1);
      const dodgeChance = Math.min(100, currentStats.agility * 5 + itemEffects.dodgeChance * 100);
      const wagerMessage = runState.activeWager
        ? ` Your ${runState.activeWager.hpStake} HP wager was already spent.`
        : '';
      const noHitMessage = handModifiers.noHit ? ' Not hitting reduces incoming damage by 50%.' : '';
      if (Math.random() * 100 < dodgeChance) {
        runState.lastDamageEvent = {
          gameId: gameState.id,
          direction: 'taken',
          damage: 0,
          dodged: true,
          noHit: handModifiers.noHit,
          doubledDown: Boolean(hand.doubledDown),
        };
        messages.push(`You dodge the monster's ${damage}-damage attack.${noHitMessage}${hand.doubledDown ? ' Double down doubles the damage you would take.' : ''}${wagerMessage}`);
      } else {
        runState.playerHp = Math.round(Math.max(0, runState.playerHp - damage));
        runState.lastDamageEvent = {
          gameId: gameState.id,
          direction: 'taken',
          damage,
          noHit: handModifiers.noHit,
          doubledDown: Boolean(hand.doubledDown),
          itemDamageReduction: itemEffects.damageReduction,
        };
        const reflectedDamage = Math.min(
          Math.max(0, runState.monsterHp - 1),
          Math.floor(damage * itemEffects.damageReflection),
        );
        runState.monsterHp = Math.round(runState.monsterHp - reflectedDamage);
        const reflectionMessage = reflectedDamage > 0
          ? ` Your gear reflects ${reflectedDamage} damage.`
          : '';
        messages.push(hand.doubledDown
          ? `The monster deals ${damage} damage to you.${noHitMessage} Double down doubles the damage you take.${reflectionMessage}${wagerMessage}`
          : `The monster deals ${damage} damage to you.${noHitMessage}${reflectionMessage}${wagerMessage}`);
      }
    } else {
      messages.push('No damage dealt.');
    }
  }

  runState.lastRoundMessage = hands.length > 1
    ? messages.map((message, index) => `Hand ${index + 1}: ${message}`).join(' ')
    : messages[0];
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

  runState.lastResolvedGameId = gameState.id;
  if (runState.pendingStageClear) {
    syncStageClear().catch((error) => {
      onStageClearError(error, runState);
    });
  }
}
