export const defaultPaperDollTop = 'crimson';

export const paperDollTops = [
  { id: 'crimson', name: 'Crimson tunic', color: '#c74e6a', shade: '#702333' },
  { id: 'azure', name: 'Azure tunic', color: '#479bd2', shade: '#174a70' },
  { id: 'forest', name: 'Forest tunic', color: '#5eaa78', shade: '#28563b' },
];

export function getPaperDollTop(topId) {
  return paperDollTops.find(({ id }) => id === topId);
}
