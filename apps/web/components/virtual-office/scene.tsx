import { useEffect, useRef, useState } from "react";
import type { OfficeState, OfficeDesk, OfficeDepartment } from "../../services/virtual-office.service";
import type { OfficeRenderer } from "./webgl-office";

const zones = [
  [70, 50],
  [400, 50],
  [640, 50],
  [70, 360],
  [300, 360],
  [620, 360],
  [830, 360],
];
export function deskPosition(department: OfficeDepartment, desk: OfficeDesk) {
  const [x, y] = zones[department.order] ?? [70, 50];
  const columns = department.order === 0 || department.order === 4 ? 3 : 2;
  return { x: x + ((desk.number - 1) % columns) * 88, y: y + Math.floor((desk.number - 1) / columns) * 68 };
}

export function OfficeFallback({
  office,
  selectedId,
  onSelect,
}: {
  office: OfficeState;
  selectedId: number | null;
  onSelect: (desk: OfficeDesk) => void;
}) {
  return (
    <div className="vo-scene-scroll" role="region" aria-label="Interactive isometric office" tabIndex={0}>
      <div className="vo-scene-frame">
        <div className="vo-floor">
          <div className="vo-wall vo-wall-back" />
          <div className="vo-wall vo-wall-side" />
          <div className="vo-floor-brand">
            PATHBUILDER <span>BUILD YOUR NEXT CHAPTER</span>
          </div>
          {office.departments.map((department) => {
            const [x, y] = zones[department.order] ?? [70, 50];
            return (
              <div
                key={department.id}
                className="vo-zone-label"
                style={{ left: x, top: y - 32, color: department.color }}
              >
                {department.name}
              </div>
            );
          })}
          <div className="vo-meeting">
            <div className="vo-meeting-table" />
            <span>THE IDEAS ROOM</span>
            {[0, 1, 2, 3].map((n) => (
              <i key={n} style={{ left: 20 + (n % 2) * 70, top: n < 2 ? 2 : 95 }} />
            ))}
          </div>
          <div className="vo-lounge">
            <i />
            <i />
            <span>COFFEE & CONNECTIONS</span>
          </div>
          {[
            [25, 25],
            [1030, 25],
            [25, 640],
            [1040, 640],
            [540, 310],
          ].map(([x, y]) => (
            <div key={`${x}-${y}`} className="vo-plant" style={{ left: x, top: y }}>
              <i />
              <i />
              <i />
            </div>
          ))}
          {office.desks.map((desk) => {
            const department = office.departments.find((d) => d.id === desk.department_id);
            if (!department) return null;
            const member = office.members.find((m) => m.id === desk.member_id);
            const mine = desk.member_id === office.me.id;
            return (
              <button
                key={desk.id}
                className={`vo-desk ${mine ? "vo-desk-mine" : ""} ${selectedId === desk.id ? "vo-desk-selected" : ""}`}
                style={
                  {
                    left: deskPosition(department, desk).x,
                    top: deskPosition(department, desk).y,
                    "--dept-color": department.color,
                  } as React.CSSProperties
                }
                onClick={() => onSelect(desk)}
                aria-pressed={selectedId === desk.id}
                aria-label={`${department.name} desk ${desk.number}, ${member?.name ?? "available"}${member?.online ? ", online" : ""}`}
              >
                <span className="vo-chair" />
                <span className="vo-desktop">
                  <i className="vo-monitor" />
                  <i className="vo-keyboard" />
                  <b>{String(desk.number).padStart(2, "0")}</b>
                </span>
                {member?.online && (
                  <span className="vo-avatar">
                    <i className="vo-avatar-head" />
                    <i className="vo-avatar-body" />
                    <span>{member.name.slice(0, 2).toUpperCase()}</span>
                  </span>
                )}
                {member && (
                  <span className="vo-desk-name">
                    {mine ? "You" : member.name.split(" ")[0]}
                    <i className={member.online ? "online" : ""} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OfficeScene(props: {
  office: OfficeState;
  selectedId: number | null;
  onSelect: (desk: OfficeDesk) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<OfficeRenderer | null>(null);
  const latest = useRef(props);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<"pan" | "rotate">("pan");
  useEffect(() => {
    latest.current = props;
    renderer.current?.update(props.office, props.selectedId);
  }, [props]);
  useEffect(() => {
    if (!host.current) return;
    if (typeof WebGL2RenderingContext === "undefined") {
      setUnavailable(true);
      return;
    }
    let active = true;
    void import("./webgl-office")
      .then(({ createOfficeRenderer }) => {
        if (!active || !host.current) return;
        renderer.current = createOfficeRenderer(
          host.current,
          (id) => {
            const desk = latest.current.office.desks.find((d) => d.id === id);
            if (desk) latest.current.onSelect(desk);
          },
          () => {
            renderer.current?.dispose();
            renderer.current = null;
            if (active) {
              setReady(false);
              setUnavailable(true);
            }
          }
        );
        renderer.current.update(latest.current.office, latest.current.selectedId);
        setReady(true);
        return undefined;
      })
      .catch((error: unknown) => {
        renderer.current?.dispose();
        renderer.current = null;
        console.warn("Virtual Office 3D renderer unavailable; using the accessible floor.", error);
        if (active) {
          setReady(false);
          setUnavailable(true);
        }
      });
    return () => {
      active = false;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  return (
    <div className="vo-webgl-scene">
      <div
        ref={host}
        className="vo-webgl-host"
        hidden={!ready}
        role="img"
        aria-label="3D office floor with 39 workstations"
      />
      {ready ? (
        <>
          <div className="vo-camera-controls">
            <span>
              {mode === "pan" ? "Drag or swipe to move" : "Drag or swipe to rotate"} · Scroll or pinch to zoom
            </span>
            <div className="vo-camera-buttons">
              <button
                aria-pressed={mode === "pan"}
                onClick={() => {
                  setMode("pan");
                  renderer.current?.setMode("pan");
                }}
              >
                Move
              </button>
              <button
                aria-pressed={mode === "rotate"}
                onClick={() => {
                  setMode("rotate");
                  renderer.current?.setMode("rotate");
                }}
              >
                Rotate
              </button>
              <button aria-label="Zoom in" onClick={() => renderer.current?.zoom(1.2)}>
                +
              </button>
              <button aria-label="Zoom out" onClick={() => renderer.current?.zoom(1 / 1.2)}>
                −
              </button>
              <button onClick={() => renderer.current?.reset()}>Reset view</button>
            </div>
          </div>
          <div className="vo-camera-directions" aria-label="Move around the office">
            <button aria-label="Move office view up" onClick={() => renderer.current?.move(0, 2)}>
              ↑
            </button>
            <div>
              <button aria-label="Move office view left" onClick={() => renderer.current?.move(-2, 0)}>
                ←
              </button>
              <button aria-label="Move office view down" onClick={() => renderer.current?.move(0, -2)}>
                ↓
              </button>
              <button aria-label="Move office view right" onClick={() => renderer.current?.move(2, 0)}>
                →
              </button>
            </div>
          </div>
          <div className="vo-keyboard-desks" aria-label="Choose a workstation with your keyboard">
            {props.office.desks.map((desk) => {
              const member = props.office.members.find((m) => m.id === desk.member_id);
              return (
                <button key={desk.id} onClick={() => props.onSelect(desk)} aria-pressed={desk.id === props.selectedId}>
                  {props.office.departments.find((d) => d.id === desk.department_id)?.name} desk {desk.number}
                  {`, ${member?.name ?? "available"}${member?.online ? ", online" : ""}`}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <OfficeFallback {...props} />
          <div className="vo-fallback-note" role="status">
            {unavailable
              ? "2D office view · Scroll to move around, or use List view to choose a desk."
              : "Loading 3D office…"}
          </div>
        </>
      )}
    </div>
  );
}
