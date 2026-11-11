// Tipi dei blocchi di testo del terminale (condivisi tra albero, comandi e rendering).
export type Span = { text: string; style?: 'dim' | 'bold' | 'inverse'; cmd?: string; href?: string };

export type Block =
  | { type: 'line'; spans: Span[] }
  | { type: 'blank' }
  | { type: 'image'; src: string; alt: string; width: number; height: number };

export type Line =
  | { type: 'line'; spans: Span[] }
  | { type: 'image'; src: string; alt: string; width: number; height: number };
