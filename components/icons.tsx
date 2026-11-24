import { type ComponentType, createElement, Fragment, type ReactElement } from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// Lucide's icons (lucide.dev), as on mybizmate.io: tag 1.77.0, under the ISC license (the glyphs Lucide took from
// Feather are also under Feather's MIT license). Both texts are in assets/licenses/lucide-ISC.txt.
// Each glyph's elements are copied exactly from its SVG at that tag, the tabs' bar's too (camera first, spec §6.2):
// House, Files, Send and CircleUser are house, files, send and circle-user. An export is named after its glyph, except
// that Close is x, More is ellipsis-vertical, and ImageIcon, ListIcon and SettingsIcon are image, list and settings.
// TriangleAlert and CircleAlert keep the old names: at 1.77.0 Lucide calls those glyphs triangle-exclamation-point and
// circle-exclamation-point, and keeps triangle-alert and circle-alert as aliases.

/** Unless given, size is 24 and strokeWidth is Lucide's 2. */
export type IconProps = { size?: number; color: string; strokeWidth?: number };
export type IconComponent = ComponentType<IconProps>;

/**
 * A glyph on Lucide's 24 grid, stroked in `color`. It's hidden from TalkBack: an icon is decoration, or the control
 * it's in has the label.
 */
function lucide(...children: ReactElement[]): IconComponent {
  const glyph = createElement(Fragment, null, ...children); // passed one by one, so the elements need no keys
  return function LucideIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        {glyph}
      </Svg>
    );
  };
}

export const ArrowLeft = lucide(<Path d="m12 19-7-7 7-7" />, <Path d="M19 12H5" />);
export const Camera = lucide(
  <Path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />,
  <Circle cx="12" cy="13" r="3" />,
);
export const Check = lucide(<Path d="M20 6 9 17l-5-5" />);
export const ChevronRight = lucide(<Path d="m9 18 6-6-6-6" />);
export const CircleAlert = lucide(
  <Circle cx="12" cy="12" r="10" />,
  <Line x1="12" x2="12" y1="8" y2="12" />,
  <Line x1="12" x2="12.01" y1="16" y2="16" />,
);
export const CircleCheck = lucide(<Circle cx="12" cy="12" r="10" />, <Path d="m16 9-5.5 5.5L8 12" />);
export const CircleUser = lucide(
  <Circle cx="12" cy="12" r="10" />,
  <Circle cx="12" cy="10" r="3" />,
  <Path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />,
);
export const Close = lucide(<Path d="M18 6 6 18" />, <Path d="m6 6 12 12" />);
export const Download = lucide(
  <Path d="M12 15V3" />,
  <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  <Path d="m7 10 5 5 5-5" />,
);
export const FileText = lucide(
  <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />,
  <Path d="M14 2v5a1 1 0 0 0 1 1h5" />,
  <Path d="M10 9H8" />,
  <Path d="M16 13H8" />,
  <Path d="M16 17H8" />,
);
export const Files = lucide(
  <Path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />,
  <Path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z" />,
  <Path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1" />,
);
export const Flashlight = lucide(
  <Path d="M12 13v1" />,
  <Path d="M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1z" />,
  <Path d="M6 6h12" />,
);
export const FlashlightOff = lucide(
  <Path d="M11.652 6H18" />,
  <Path d="M12 13v1" />,
  <Path d="M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V6" />,
  <Path d="m2 2 20 20" />,
  <Path d="M7.649 2H17a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8a4 4 0 0 0-.55 1.007" />,
);
export const House = lucide(
  <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />,
  <Path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);
export const ImageIcon = lucide(
  <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" />,
  <Circle cx="9" cy="9" r="2" />,
  <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />,
);
export const ListIcon = lucide(
  <Path d="M3 5h.01" />,
  <Path d="M3 12h.01" />,
  <Path d="M3 19h.01" />,
  <Path d="M8 5h13" />,
  <Path d="M8 12h13" />,
  <Path d="M8 19h13" />,
);
export const Lock = lucide(
  <Rect width="18" height="11" x="3" y="11" rx="2" ry="2" />,
  <Path d="M7 11V7a5 5 0 0 1 10 0v4" />,
);
export const More = lucide(
  <Circle cx="12" cy="12" r="1" />,
  <Circle cx="12" cy="5" r="1" />,
  <Circle cx="12" cy="19" r="1" />,
);
export const Search = lucide(<Path d="m21 21-4.34-4.34" />, <Circle cx="11" cy="11" r="8" />);
export const Send = lucide(
  <Path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />,
  <Path d="m21.854 2.147-10.94 10.939" />,
);
export const SettingsIcon = lucide(
  <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />,
  <Circle cx="12" cy="12" r="3" />,
);
export const Share = lucide(
  <Path d="M12 2v13" />,
  <Path d="m16 6-4-4-4 4" />,
  <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />,
);
export const TriangleAlert = lucide(
  <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />,
  <Path d="M12 9v4" />,
  <Path d="M12 17h.01" />,
);
