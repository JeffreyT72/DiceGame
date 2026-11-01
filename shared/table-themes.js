export const tableThemes = [
  { id: 'default', name: 'Classic Green', color: '084632', price: 0 },
  { id: '062633', name: 'Deep Teal', color: '062633', price: 500 },
  { id: '630632', name: 'Berry', color: '630632', price: 500 },
  { id: '123C69', name: 'Navy', color: '123C69', price: 500 },
  { id: '6B2145', name: 'Plum', color: '6B2145', price: 500 },
  { id: '8A3B12', name: 'Burnt Orange', color: '8A3B12', price: 500 },
  { id: '4A4E19', name: 'Olive', color: '4A4E19', price: 500 },
];

export function getTableTheme(id) {
  return tableThemes.find((theme) => theme.id === id);
}
