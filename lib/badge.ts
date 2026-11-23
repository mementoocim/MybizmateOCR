// Design B §5.6 and §6: what a badge says, and in which tone. components/Badge draws it; lib/ names one (Home's badge
// for a recent scan, say) without importing a component.

export type BadgeTone = 'warning' | 'success' | 'brand' | 'neutral' | 'danger';
export type BadgeSpec = { label: string; tone: BadgeTone };
