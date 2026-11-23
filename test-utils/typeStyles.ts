import { type } from '../lib/theme';

/**
 * The names of the type styles (lib/theme's `type`) a Text was given, with its nested style arrays opened. Jest runs
 * as iOS, where face() sets no family, so a mono style and a grotesk one of the same size flatten alike (figureSmall
 * and label, say) and toHaveStyle can't tell them apart: the token itself can.
 */
export function typeStylesOf(node: { props: { style?: unknown } }): string[] {
  const given: unknown[] = [node.props.style].flat(Infinity);
  return (Object.keys(type) as (keyof typeof type)[]).filter((name) => given.includes(type[name]));
}
