import { Header } from '../../../components/Header';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { usePushOnce } from '../../../lib/navigation';

/**
 * The Export tab: a stand-in, with no Back (a tab), until Task 10 builds it. Its one row opens Saved, so today's
 * export stays reachable.
 */
export default function ExportScreen() {
  const push = usePushOnce();
  return (
    <Screen header={<Header title="Send to MyBizMate" onBack={null} />}>
      <ListRow title="Saved" chevron onPress={() => push('/saved')} />
    </Screen>
  );
}
