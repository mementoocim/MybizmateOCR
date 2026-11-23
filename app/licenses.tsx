import { FlatList } from 'react-native';

import { Header } from '../components/Header';
import { ListRow } from '../components/ListRow';
import { Screen, useEndPadding } from '../components/Screen';
import { LICENSES } from '../lib/licenses';
import { usePushOnce } from '../lib/navigation';

// Design B §9.10: Settings › About › Open-source licenses. What the app ships (lib/licenses), a row each: the name,
// then its license and version in figures, and a chevron. A row opens its text (app/license), by its place here.

export default function LicensesScreen() {
  const push = usePushOnce();
  const end = useEndPadding(false);
  return (
    <Screen scroll={false} header={<Header title="Open-source licenses" />}>
      <FlatList
        testID="licenses-list"
        data={LICENSES}
        keyExtractor={(entry) => entry.name}
        initialNumToRender={LICENSES.length} // a short list: all of it at once
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            sub={`${item.license} · ${item.version}`}
            subMono
            chevron
            onPress={() => push(`/license?i=${index}`)}
          />
        )}
        contentContainerStyle={{ paddingBottom: end }}
      />
    </Screen>
  );
}
