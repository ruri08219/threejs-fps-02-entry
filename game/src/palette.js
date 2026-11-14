// ASHFALL PROTOCOL — the look plan, in one place. Six values and one accent hue;
// the lighting makes every shade the game needs, so no other colour appears in code.
// The same six names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191d26',
  surface: '#232833',
  hairline: '#333a48',
  ink: '#ece7da',
  muted: '#9aa3b2',
  accent: '#ff7a2f',
};

export function shade(name) {
  return PALETTE[name];
}
