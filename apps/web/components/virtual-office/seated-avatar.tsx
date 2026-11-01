import { useId } from "react";
import type { CSSProperties } from "react";
import type { OfficeMember } from "../../services/virtual-office.service";
import type { AvatarAnchor } from "./avatar-anchors";
import { chairBackrestMask, deskForegroundMask, seatedAvatarModel } from "./avatar-anchors";

export function SeatedAvatar({
  member,
  anchor,
  position,
}: {
  member: OfficeMember;
  anchor: AvatarAnchor;
  position: { x: number; y: number };
}) {
  const clipId = `vo-chair-${useId().replace(/:/g, "")}`;
  const model = seatedAvatarModel(anchor, member.avatar_style);
  const masks = [
    chairBackrestMask(anchor).map(([x, y]) => [x + anchor.x, y + anchor.y]),
    deskForegroundMask(anchor),
  ].filter((mask) => mask.length > 0);
  return (
    <span className="vo-workstation-local" aria-hidden="true">
      <span
        className="vo-chair-anchor"
        data-facing={anchor.direction}
        data-rotation={model.rotation}
        style={{ transform: `translate(${anchor.x}px,${anchor.y}px)` }}
      >
        <span className="vo-seated-model-correction" style={{ transform: model.mirror ? "scaleX(-1)" : "none" }}>
          <img
            className="vo-seated-sprite"
            src={model.src}
            alt=""
            draggable={false}
            style={{ left: model.left, top: model.top, width: model.width, height: model.height } as CSSProperties}
          />
        </span>
      </span>
      {masks.length > 0 && (
        <svg className="vo-chair-foreground" viewBox="-64 -64 128 128">
          <defs>
            <clipPath id={clipId}>
              {masks.map((mask) => (
                <polygon key={mask.join(" ")} points={mask.map(([x, y]) => `${x},${y}`).join(" ")} />
              ))}
            </clipPath>
          </defs>
          <image
            href="/virtual-office/art-v1/office-environment.png"
            x={-position.x}
            y={-position.y}
            width="1536"
            height="1024"
            clipPath={`url(#${clipId})`}
          />
        </svg>
      )}
    </span>
  );
}

export function AvatarNameplate({
  member,
  anchor,
  position,
  labelPosition,
}: {
  member: OfficeMember;
  anchor: AvatarAnchor;
  position: { x: number; y: number };
  labelPosition?: { x: number; y: number };
}) {
  const model = seatedAvatarModel(anchor, member.avatar_style);
  return (
    <span
      className="vo-seated-nameplate"
      style={{
        left: labelPosition?.x ?? position.x + anchor.x,
        top: labelPosition?.y ?? position.y + anchor.y + model.nameplateY,
      }}
      title={member.name}
    >
      <i className="vo-art-dot online" />
      {member.name}
    </span>
  );
}
