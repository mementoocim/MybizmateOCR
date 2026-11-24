import { Header } from '../../../components/Header';
import { Screen } from '../../../components/Screen';

/** A session, inside the Sessions tab and under its bar: a stand-in until Task 9 builds it. Back goes to Sessions. */
export default function SessionScreen() {
  return <Screen header={<Header title="Session" />} />;
}
