export const iconPaths = {
  down: 'M12 4v16m-6-6 6 6 6-6',
  right: 'M4 12h16m-6-6 6 6-6 6',
  left: 'M20 12H4m6-6-6 6 6 6',
  external: 'M6 18 18 6M6 6h12v12',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M6 18 18 6',
  download: 'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',
  play: 'm9 5 11 7-11 7V5Z',
  send: 'm4 12 16-8-8 16-2-10-6 2Zm6-2 10-6',
  moon: 'M20 15.1A8.4 8.4 0 0 1 8.9 4 8.5 8.5 0 1 0 20 15.1Z',
  sparkle:
    'M12 3c.7 4.9 3.1 7.3 8 8-4.9.7-7.3 3.1-8 8-.7-4.9-3.1-7.3-8-8 4.9-.7 7.3-3.1 8-8Z',
  stop: 'M7 7h10v10H7Z',
  chevron: 'm6 9 6 6 6-6',
  chip: 'M8 8h8v8H8ZM10 3v3m4-3v3m-4 12v3m4-3v3M3 10h3m-3 4h3m12-4h3m-3 4h3',
} as const;
export type IconName = keyof typeof iconPaths;
