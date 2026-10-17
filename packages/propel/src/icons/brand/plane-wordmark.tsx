/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

export function PlaneWordmark({ width = "264", height = "64", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 264 64"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PathBuilder"
    >
      <text x="0" y="44" fontFamily="Inter, Arial, sans-serif" fontSize="42" fontWeight="600" letterSpacing="-1">
        PathBuilder
      </text>
    </svg>
  );
}
