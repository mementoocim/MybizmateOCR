import { render, screen } from '@testing-library/react-native';

import * as icons from '../components/icons';
import {
  ArrowLeft, Camera, Check, ChevronRight, CircleAlert, CircleCheck, CircleUser, Close, Download, Files, FileText,
  Flashlight, FlashlightOff, House, ImageIcon, ListIcon, Lock, More, Search, Send, SettingsIcon, Share, TriangleAlert,
} from '../components/icons';

// Design B §5.4: Lucide's stroke icons, as on mybizmate.io, in place of today's filled Material paths. In the
// design's order: arrow-left, x, list, settings, camera, image, file-text, chevron-right, lock, flashlight,
// flashlight-off, share, ellipsis-vertical, search, triangle-alert, circle-check, circle-alert, download, check; then
// the bar's (camera first, spec §6.2): house, files, send and circle-user.
const GLYPHS = {
  ArrowLeft, Close, ListIcon, SettingsIcon, Camera, ImageIcon, FileText, ChevronRight, Lock, Flashlight,
  FlashlightOff, Share, More, Search, TriangleAlert, CircleCheck, CircleAlert, Download, Check,
  House, Files, Send, CircleUser,
};

test('every glyph is a Lucide stroke icon', async () => {
  for (const [name, Icon] of Object.entries(GLYPHS)) {
    await render(<Icon color="#123456" />);
    // The Svg's own view carries the Svg's props. (RNTL 14 renders host views only: there's no UNSAFE_getByType.)
    const { fill, stroke, strokeWidth, width, importantForAccessibility } = screen.root!.props;
    expect({ name, fill, stroke, strokeWidth, width, importantForAccessibility }).toEqual({
      name,
      fill: 'none',
      stroke: '#123456',
      strokeWidth: 2,
      width: 24,
      importantForAccessibility: 'no-hide-descendants',
    });
  }
});

test('the dropped glyphs are gone', () => {
  // Bolt went with the camera's old Auto control (§5.4), which read as flash next to the torch
  for (const name of ['Bolt', 'FlashOn', 'FlashOff', 'ArrowBack', 'DocumentIcon', 'CheckCircle', 'ErrorCircle']) {
    expect(icons).not.toHaveProperty(name);
  }
});
