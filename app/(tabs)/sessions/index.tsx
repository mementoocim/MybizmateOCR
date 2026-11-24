import { Header } from '../../../components/Header';
import { Screen } from '../../../components/Screen';

/** The Sessions tab: a stand-in, with no Back (a tab), until Task 8 lists the sessions here. */
export default function SessionsScreen() {
  return <Screen header={<Header title="Sessions" onBack={null} />} />;
}
