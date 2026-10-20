import { memo, useMemo } from "react";
import { workstationMarkup } from "./modular-workstation";

export const ModularWorkstation = memo(function ModularWorkstation({
  occupied,
  female,
  reverse,
}: {
  occupied: boolean;
  female: boolean;
  reverse: boolean;
}) {
  const markup = useMemo(() => workstationMarkup({ occupied, female, reverse }), [occupied, female, reverse]);
  // Markup contains generated numeric geometry and constant colors only, never employee input.
  return (
    <svg
      className="vo-modular-workstation"
      viewBox="200 220 500 390"
      aria-hidden="true"
      data-occupied={occupied}
      data-facing={reverse ? "reverse" : "forward"}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

/** A single architectural plate, free of workstation furniture. Positions follow the approved floor. */
export const ModularAmenities = memo(function ModularAmenities({ height }: { height: number }) {
  const plants = [
    [125, 390],
    [160, 460],
    [220, 505],
    [425, 450],
    [520, 425],
    [535, 370],
    [610, 270],
    [835, 250],
    [1010, 245],
    [1115, 400],
    [1150, 480],
    [1095, 540],
    [780, 720],
    [860, 775],
    [1020, 800],
    [1115, 900],
    [1410, 640],
    [1460, 725],
    [725, 905],
    [470, 810],
    [355, 720],
    [200, 660],
    [545, 155],
    [820, 100],
    [1060, 190],
  ];
  return (
    <svg
      className="vo-modular-architecture"
      viewBox={`0 0 1536 ${height / 1.5}`}
      aria-label="One open office floor with central garden lounge, glass meeting room, reception and planted walkways"
    >
      <defs>
        <linearGradient id="vo-floor-tone" x2="0.8" y2="1">
          <stop stopColor="#f6f3e9" />
          <stop offset="1" stopColor="#e4e4dc" />
        </linearGradient>
        <linearGradient id="vo-glass-tone" x2="1" y2="1">
          <stop stopColor="#b9d6db" stopOpacity=".65" />
          <stop offset="1" stopColor="#edf5ee" stopOpacity=".1" />
        </linearGradient>
        <pattern
          id="vo-floor-tile"
          width="140"
          height="90"
          patternUnits="userSpaceOnUse"
          patternTransform="matrix(1,.28,-.8,.55,0,0)"
        >
          <rect width="140" height="90" fill="none" stroke="#c9cfc4" strokeWidth="1" opacity=".45" />
        </pattern>
      </defs>
      <path d="M70 280 690 25 1500 350 1500 850 900 1010 70 650Z" fill="#bfcac1" transform="translate(0 18)" />
      <path
        d="M70 280 690 25 1500 350 1500 850 900 1010 70 650Z"
        fill="url(#vo-floor-tone)"
        stroke="#d0d6ca"
        strokeWidth="3"
      />
      <path d="M70 280 690 25 1500 350 1500 850 900 1010 70 650Z" fill="url(#vo-floor-tile)" />
      {height > 1536 && (
        <rect
          x="70"
          y="1000"
          width="1430"
          height={height / 1.5 - 1020}
          rx="12"
          fill="url(#vo-floor-tone)"
          stroke="#cbd7cc"
        />
      )}
      {/* Back glazing and exterior planting, placed behind the workstation banks. */}
      <path d="M70 280 690 25 690 110 70 365Z" fill="url(#vo-glass-tone)" stroke="#9eb7b9" strokeWidth="3" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <path key={i} d={`M${70 + i * 88.6} ${280 - i * 36.4}v85`} stroke="#8fa9ad" strokeWidth="3" />
      ))}
      <path d="M690 25 1500 350 1500 435 690 110Z" fill="#e6dbbf" stroke="#d1c9b1" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <ellipse cx={720 + i * 140} cy={70 + i * 56} rx="9" ry="5" fill="#fff9e4" />
          <path d={`M${720 + i * 140} ${76 + i * 56}l-12 33 30 8Z`} fill="#fff9dd" opacity=".35" />
        </g>
      ))}
      {/* Glass meeting room occupies the rear right, as in the reference. */}
      <g transform="translate(1090 205)">
        <path d="M0 0 140-55 280 5 140 65Z" fill="#e1e4d9" />
        <path d="M0 0v110l140 65V65Z" fill="url(#vo-glass-tone)" stroke="#9fb5b4" strokeWidth="2" />
        <path d="M140 65 280 5v110l-140 60Z" fill="#c1d5d2" opacity=".35" stroke="#9fb5b4" strokeWidth="2" />
        <path d="M20 100 140 48 250 95 135 145Z" fill="#d8b98b" stroke="#bea179" strokeWidth="3" />
        {[45, 95, 175, 225].map((x, i) => (
          <rect key={x} x={x} y={i < 2 ? 72 : 117} width="24" height="15" rx="4" fill="#728784" />
        ))}
        <text x="55" y="19" fill="#637a78" fontSize="13" transform="rotate(24 55 19)">
          Meeting room
        </text>
      </g>
      {/* Warm wood reception and PathBuilder-only wall branding. */}
      <g transform="translate(1220 420)">
        <path d="M-20-35 200 55v75L-20 40Z" fill="#d7bb93" />
        <image
          href="/virtual-office/art-v1/pathbuilder-only.svg"
          x="15"
          y="-2"
          width="155"
          height="40"
          transform="matrix(1,.4,0,1,0,-10)"
        />
        <path d="M0 90 90 50 220 105 125 150Z" fill="#dfc29a" />
        <path d="M0 90v25l125 62v-27Z" fill="#b29671" />
        <path d="M125 150 220 105v25l-95 47Z" fill="#c3a782" />
      </g>
      {/* Central tree lounge keeps the open circulation lanes around it. */}
      <g transform="translate(640 520)">
        <ellipse rx="150" ry="83" fill="#ddd3bc" />
        <ellipse rx="141" ry="75" fill="#e9e0cc" />
        <path
          d="M-95 12q-30-55 35-60l80 15q42 15 22 48l-30 20q-24-35-66-25Z"
          fill="#8eb9c1"
          stroke="#739da7"
          strokeWidth="8"
        />
        <ellipse cx="30" cy="-7" rx="32" ry="18" fill="#72909a" />
        <path d="M30-15v-75" stroke="#8a795c" strokeWidth="12" />
        {[
          [-30, -95],
          [5, -120],
          [43, -108],
          [65, -84],
          [15, -77],
        ].map(([x, y], i) => (
          <ellipse
            key={`${x},${y}`}
            cx={x}
            cy={y}
            rx="36"
            ry="27"
            fill={["#72935e", "#87a46b", "#638451", "#8ea970", "#6f8f58"][i]}
          />
        ))}
        <ellipse cx="-95" cy="40" rx="23" ry="14" fill="#d6b95c" />
        <ellipse cx="85" cy="28" rx="23" ry="14" fill="#d6b95c" />
        <ellipse cx="-45" cy="58" rx="26" ry="14" fill="#f8f1d9" />
        <ellipse cx="108" cy="-24" rx="24" ry="13" fill="#f8f1d9" />
      </g>
      {plants.map(([x, y], i) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <path d="M-14 0h28l-4 20h-20Z" fill={i % 3 === 0 ? "#d7c7ab" : "#bdc8b3"} />
          <ellipse cy="-3" rx="19" ry="12" fill="#769b69" />
          <ellipse cx="-9" cy="-11" rx="9" ry="14" fill="#8baa73" />
          <ellipse cx="9" cy="-14" rx="9" ry="16" fill="#63885a" />
          {i % 3 === 0 && (
            <>
              <circle cx="-9" cy="-15" r="5" fill="#ecc2c5" />
              <circle cx="6" cy="-18" r="5" fill="#f0d29e" />
              <circle cx="13" cy="-6" r="4" fill="#e8b6cc" />
            </>
          )}
        </g>
      ))}
      {/* Low transparent perimeter avoids concealing interactive seats. */}
      <path
        d="M70 650v-36l830 360 600-160v36L900 1010Z"
        fill="#bad2d1"
        fillOpacity=".24"
        stroke="#9eb9b6"
        strokeWidth="2"
      />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <path key={i} d={`M${70 + i * 118} ${650 + i * 51.4}v-36`} stroke="#91aca9" strokeWidth="2" />
      ))}
    </svg>
  );
});
