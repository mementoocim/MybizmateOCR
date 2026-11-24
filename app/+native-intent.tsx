import { unwrapDevLaunchURL } from 'expo-linking';

/**
 * Camera first (spec §6.1, call 1): a launch with no route of its own opens the camera, not Home. That's a launch
 * from the launcher (expo-router asks for the root URL, mybizmatescan:///) or a development build's launch link, which
 * names the bundler and no route. A link with a route keeps it: mybizmatescan://camera?test=…, and the team's /speed
 * and /training. A link that comes while the app runs goes on as it came, and so does anything this can't read: it
 * never throws. expo-router calls it for the initial URL and for each link after.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!initial) return path;
  try {
    return routeOf(unwrapDevLaunchURL(path)) === '' ? '/camera' : path;
  } catch {
    return path; // the link goes on as it came
  }
}

/**
 * A link's route: what's after a web link's host, or right after a deep link's scheme://; with no query, hash, Expo
 * Go's --, or slashes at its ends.
 */
function routeOf(url: string): string {
  let rest = url.replace(/[?#].*$/, '');
  const web = /^https?:[/][/][^/]*/i.exec(rest);
  rest = web ? rest.slice(web[0].length) : rest.replace(/^[a-z][a-z0-9+.-]*:[/][/]/i, '');
  return rest.replace(/^[/]+|[/]+$/g, '').replace(/^--([/]|$)/, '');
}
