export function getCombatHandModifiers(playerHand, hitCount) {
  return {
    matchingPair: playerHand.length >= 2
      && playerHand[0].rank === playerHand[1].rank,
    fiveCardHand: playerHand.length === 5,
    noHit: !hitCount,
  };
}
