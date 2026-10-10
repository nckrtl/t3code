import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

/**
 * Orbit's ring mark (orbit-website `public/assets/orbit/logo-white.svg`), in the theme's icon color.
 * The view box pads the ring a little inside its frame. It is drawn slightly wider than the SF
 * Symbols beside it because a flat ring carries less visual weight than their glyphs.
 */
export function OrbitLogo(props: { readonly size: number }) {
  return (
    <Svg width={props.size} height={props.size} viewBox="-5 -5 110 110" accessibilityLabel="Orbit">
      <ThemedPath
        d="M50 25C77.6143 25 100 36.1929 100 50C99.9996 63.8069 77.614 75 50 75C22.386 75 0.000366987 63.8069 0 50C0 36.1929 22.3858 25 50 25ZM49.7764 32.0107C32.7857 32.0108 15.7344 38.9923 15.7344 46.9102C15.7346 54.8279 28.3485 61.2461 49.5654 61.2461C70.7823 61.2461 83.3962 54.8279 83.3965 46.9102C83.3965 38.9923 66.7672 32.0107 49.7764 32.0107Z"
        colorClassName="accent-icon"
        fill="currentColor"
        fillRule="evenodd"
      />
    </Svg>
  );
}
