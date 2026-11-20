// Team builds show the team's own tools (the speed test, the scan's stage timings): development builds, and releases
// built with EXPO_PUBLIC_TEAM_BUILD=1. The builds clients install don't.
export const TEAM_BUILD: boolean = __DEV__ || process.env.EXPO_PUBLIC_TEAM_BUILD === '1';
