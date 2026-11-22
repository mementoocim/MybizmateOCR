import type { ScrollViewInstance, ViewInstance } from 'react-native';

/**
 * jest's ScrollView has no layout: this stands in its content view, which scroll-into-view measures a field against,
 * and records its scrolls.
 */
export function standIn(scrollView: ScrollViewInstance | null): { content: ViewInstance; scrollTo: jest.Mock } {
  const content = {} as ViewInstance;
  const scrollTo = jest.fn();
  Object.assign(scrollView!, { getInnerViewRef: () => content, scrollTo });
  return { content, scrollTo };
}
