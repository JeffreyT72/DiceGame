export const tableThemes = [
  { id: 'default', name: 'Classic Green', color: '084632', price: 0 },
  { id: '062633', name: 'Deep Teal', color: '062633', price: 100 },
  { id: '630632', name: 'Berry', color: '630632', price: 100 },
];

export function getTableTheme(id) {
  return tableThemes.find((theme) => theme.id === id);
}
