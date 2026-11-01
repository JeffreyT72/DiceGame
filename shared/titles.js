export const titles = [
  { id: 0, name: 'Blackjack Survivor', effect: null, price: 0 },
  { id: 1, name: 'Blackjack Lover', effect: null, price: 1000 },
  { id: 2, name: 'Lucky Lucky', effect: null, price: 1000 },
  { id: 3, name: 'Blazing 777', effect: null, price: 1000 },
  { id: 4, name: 'Bonus Spin Extreme', effect: null, price: 1000 },
  { id: 5, name: 'Push 22', effect: null, price: 1000 },
  { id: 6, name: 'Double Double Down', effect: null, price: 1000 },
];

export function getTitle(id) {
  return titles.find((title) => title.id === id);
}
