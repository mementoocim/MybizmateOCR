import { StyleSheet, View } from 'react-native';

import { TeamOnly } from '../components/TeamOnly';
import { colors } from '../lib/theme';

// Training data, from Settings › Team tools: the team's export of the scans saved in annotation mode. The screen stays
// empty until the export is built.
export default function TrainingScreen() {
  return (
    <TeamOnly>
      <View style={styles.screen} />
    </TeamOnly>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
});
