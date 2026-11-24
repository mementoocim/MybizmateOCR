import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '../../components/TabBar';
import { colors } from '../../lib/theme';

/**
 * Camera first (spec §6.1, calls 1 and 8): the tabs, at the bottom of the root Stack. They're anchored on the camera,
 * so a link opened cold to another tab, or to a screen above the tabs, has the camera under it; and Back goes to the
 * camera from any other tab (backBehavior initialRoute), then, with nothing under the camera, out of the app. The bar
 * is components/TabBar, floating over the scenes: a scene gets none of the default bar's space, and keeps clear of it
 * itself (Screen's useTabBarSpace). It hides while the keyboard is up. Each scene sits on paper, the camera on black.
 * The routes' names are TabBar's TABS: a name missing here drops its slot.
 */
export const unstable_settings = { anchor: 'camera' };

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: colors.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="sessions" />
      <Tabs.Screen name="camera" options={{ sceneStyle: { backgroundColor: colors.camera } }} />
      <Tabs.Screen name="export" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
