import Svg, { Path } from 'react-native-svg';

/** A sales invoice with its 4 corner squares in a camera's viewfinder (the test app's ill_scan.xml). */
export function ScanIllustration({ size = 112 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Path
        d="M29,15h38a4,4 0,0 1,4 4v58a4,4 0,0 1,-4 4h-38a4,4 0,0 1,-4 -4v-58a4,4 0,0 1,4 -4z"
        fill="#FFFFFF"
        stroke="#E1DDD8"
        strokeWidth={1.5}
      />
      <Path d="M28.5,18.5h4v4h-4z" fill="#201913" />
      <Path d="M63.5,18.5h4v4h-4z" fill="#201913" />
      <Path d="M28.5,73.5h4v4h-4z" fill="#201913" />
      <Path d="M63.5,73.5h4v4h-4z" fill="#201913" />
      <Path d="M35,27h16v3h-16z" fill="#FC7C4C" />
      <Path d="M35,35h26v2.5h-26z" fill="#E1DDD8" />
      <Path d="M35,42h22v2.5h-22z" fill="#E1DDD8" />
      <Path d="M35,49h26v2.5h-26z" fill="#E1DDD8" />
      <Path d="M35,56h18v2.5h-18z" fill="#E1DDD8" />
      <Path d="M48,64h13v3h-13z" fill="#201913" />
      <Path
        d="M14,24v-10h10M72,14h10v10M14,72v10h10M82,72v10h-10"
        fill="none"
        stroke="#FC7C4C"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
