// Tapedeck icon set (component library v3): 24 px grid, 1.5 px stroke, square ends, sharp corners.
const paths = {
  play: 'M7 4.5v15L19.5 12z',
  pause: 'M8 5v14M16 5v14',
  next: 'M6 5.5v13l9.5-6.5zM18.5 5v14',
  prev: 'M18 5.5v13L8.5 12zM5.5 5v14',
  plus: 'M12 4v16M4 12h16',
  close: 'M5 5l14 14M19 5L5 19',
  check: 'M4 12.5l5 5L20 6.5',
  back: 'M15 4l-8 8 8 8',
  chevron: 'M9 4l8 8-8 8',
  down: 'M4 9l8 8 8-8',
  up: 'M4 15l8-8 8 8',
  more: 'M4.5 12h1M11.5 12h1M18.5 12h1',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM15.5 15.5l5 5',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4',
  fwd30: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4',
  back15: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 3.5v4h4',
  today: 'M2 19c1.67 0 1.67-13 3.33-13s1.67 13 3.33 13 1.67-13 3.33-13 1.67 13 3.33 13 1.67-13 3.33-13 1.67 13 3.33 13',
  topics: 'M7 3l4 4-4 4-4-4zM17 3l4 4-4 4-4-4zM7 13l4 4-4 4-4-4zM17 13l4 4-4 4-4-4z',
  library: 'M7 3l4 4-4 4-4-4zM17 3l4 4-4 4-4-4zM7 13l4 4-4 4-4-4zM17 13l4 4-4 4-4-4z',
  series: 'M3 6h18M3 12h13M3 18h8',
  settings: 'M3 7h18M3 17h18M8 4v6M16 14v6',
  playlist: 'M3 6h13M3 11h13M3 16h7M15.5 14v7l5.5-3.5z',
  queue: 'M3 6h18M3 12h18M3 18h11',
  trash: 'M4 6h16M9 3h6M6 6l1 15h10l1-15',
  edit: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  link: 'M9.5 14.5l5-5M8 11l-3 3a3.5 3.5 0 0 0 5 5l3-3M16 13l3-3a3.5 3.5 0 0 0-5-5l-3 3',
  // added for the app, drawn to the same rules
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  sparkle: 'M12 3v18M3 12h18M7 7l10 10M17 7L7 17',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  volume: 'M3 9h4l5-4v14l-5-4H3zM15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12',
  download: 'M12 3.5v11.5M7 10l5 5 5-5M4.5 20h15',
  heart: 'M12 20l-7.2-7.3a4.6 4.6 0 0 1 7.2-5.7 4.6 4.6 0 0 1 7.2 5.7z',
  star: 'M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3.1-5.4 3.1 1.2-6-4.5-4.2 6.1-.7z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d={paths[name]} />
    </svg>
  );
}
