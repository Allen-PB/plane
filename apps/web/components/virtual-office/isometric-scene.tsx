import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { OfficeDesk, OfficeState } from "../../services/virtual-office.service";
import { zoomOfficeCamera } from "./isometric-layout";
import type { OfficeCamera } from "./isometric-layout";
import { arrangeNameplates } from "./avatar-anchors";
import { modularFloorLayout, fitModularCamera, departmentCodes } from "./modular-layout";
import { ModularWorkstation, ModularAmenities } from "./modular-furniture";

export function IsometricOfficeScene({
  office,
  selectedId,
  departmentId,
  onSelect,
  onDepartment,
  resetKey = 0,
}: {
  resetKey?: number;
  office: OfficeState;
  selectedId: number | null;
  departmentId: number | null;
  onSelect: (desk: OfficeDesk) => void;
  onDepartment: (id: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    world = useRef<HTMLDivElement>(null);
  const camera = useRef<OfficeCamera>({ x: 0, y: 0, scale: 1 }),
    fitScale = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinchDistance = useRef(0);
  const [zoom, setZoom] = useState(100),
    [labels, setLabels] = useState(false),
    [failed, setFailed] = useState(false);
  const layout = useMemo(
    () => modularFloorLayout({ departments: office.departments, desks: office.desks }),
    [office.departments, office.desks]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const focusedOrder = office.departments.find((d) => d.id === departmentId)?.order;
  const focus = useRef(focusedOrder);
  focus.current = focusedOrder;
  const paint = useCallback((next: OfficeCamera) => {
    camera.current = next;
    if (world.current) world.current.style.transform = `translate(${next.x}px,${next.y}px) scale(${next.scale})`;
    setZoom(Math.round((next.scale / fitScale.current) * 100));
  }, []);
  const reset = useCallback(
    (order?: number) => {
      const host = viewport.current;
      if (!host) return;
      const current = layoutRef.current;
      const next = fitModularCamera(host.clientWidth, host.clientHeight, current);
      fitScale.current = next.scale;
      const area = current.areas.find((a) => a.department.order === order);
      if (area) {
        next.scale = Math.min(
          next.scale * 3.5,
          host.clientWidth / (area.width + 130),
          host.clientHeight / (area.height + 100)
        );
        next.x = host.clientWidth / 2 - (area.x + area.width / 2) * next.scale;
        next.y = host.clientHeight / 2 - (area.y + area.height / 2) * next.scale;
      }
      paint(next);
    },
    [paint]
  );
  const changeZoom = useCallback(
    (factor: number, point?: { x: number; y: number }) => {
      const host = viewport.current;
      if (!host) return;
      paint(
        zoomOfficeCamera(
          camera.current,
          factor,
          point ?? { x: host.clientWidth / 2, y: host.clientHeight / 2 },
          fitScale.current
        )
      );
    },
    [paint]
  );
  useEffect(() => {
    const host = viewport.current;
    if (!host) return;
    const resize = () => reset(focus.current);
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      changeZoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    host.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer?.disconnect();
      host.removeEventListener("wheel", wheel);
    };
  }, [layout.width, layout.height, reset, changeZoom]);
  useEffect(() => {
    reset(focusedOrder);
  }, [focusedOrder, resetKey, layout.width, layout.height, reset]);
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button") || (event.pointerType === "mouse" && event.button !== 0))
      return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    pinchDistance.current = 0;
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = event.currentTarget.getBoundingClientRect();
      if (pinchDistance.current)
        changeZoom(distance / pinchDistance.current, { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
      pinchDistance.current = distance;
    } else
      paint({
        ...camera.current,
        x: camera.current.x + event.clientX - old.x,
        y: camera.current.y + event.clientY - old.y,
      });
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = 0;
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [36, 0],
      ArrowRight: [-36, 0],
      ArrowUp: [0, 36],
      ArrowDown: [0, -36],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [x, y] = moves[event.key];
      paint({ ...camera.current, x: camera.current.x + x, y: camera.current.y + y });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(1.2);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(1 / 1.2);
    } else if (event.key === "Home") {
      event.preventDefault();
      reset();
    }
  }
  const occupants = layout.desks.flatMap((workstation) => {
    const member = office.members.find((m) => m.id === workstation.desk.member_id);
    return member?.online ? [{ member, workstation }] : [];
  });
  const nameplates = arrangeNameplates(
    occupants.map(({ member, workstation: w }) => ({
      id: member.id,
      x: w.x + (w.reverse ? 16 : -16),
      y: w.y - 50,
      width: Math.min(190, member.name.length * 6.5 + 28),
    })),
    layout.areas.map((a) => ({
      left: a.labelX - 100,
      right: a.labelX + 100,
      top: a.labelY - 25,
      bottom: a.labelY + 25,
    }))
  );
  return (
    <div className="vo-art-scene">
      <div
        ref={viewport}
        className="vo-art-viewport"
        role="region"
        aria-label="PathBuilder office floor. Drag to move, scroll to zoom, or use arrow keys."
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onLostPointerCapture={pointerEnd}
        onKeyDown={keyboard}
      >
        <div
          ref={world}
          className={`vo-art-world vo-modular-world ${labels ? "" : "vo-hide-art-labels"}`}
          style={{ width: layout.width, height: layout.height }}
        >
          <ModularAmenities height={layout.height} />
          {layout.areas.map((area) => (
            <button
              key={area.department.id}
              className={`vo-art-zone ${departmentId !== null && departmentId !== area.department.id ? "dimmed" : ""}`}
              style={
                {
                  left: area.labelX,
                  top: area.labelY,
                  "--vo-department": area.department.color,
                } as CSSProperties
              }
              onClick={() => onDepartment(area.department.id)}
            >
              <strong>{area.department.name}</strong>
              <small>{area.desks.length} desks</small>
            </button>
          ))}
          {layout.desks.map((w) => {
            const member = office.members.find((m) => m.id === w.desk.member_id);
            const label = `${departmentCodes[w.department.order] ?? "DESK"}-${String(w.desk.number).padStart(2, "0")}`;
            return (
              <button
                key={w.desk.id}
                className={`vo-art-seat vo-modular-seat ${selectedId === w.desk.id ? "selected" : ""} ${departmentId !== null && departmentId !== w.department.id ? "dimmed" : ""}`}
                style={
                  {
                    left: w.x,
                    top: w.y,
                    zIndex: Math.round(w.y),
                    "--vo-department": w.department.color,
                  } as CSSProperties
                }
                aria-label={`${label}, ${member ? `reserved by ${member.name}, ${member.online ? "online" : "offline"}` : "available"}`}
                aria-pressed={selectedId === w.desk.id}
                onClick={() => onSelect(w.desk)}
              >
                <ModularWorkstation
                  occupied={Boolean(member?.online)}
                  female={member?.avatar_style === "female"}
                  reverse={w.reverse}
                />
                <span className="vo-art-seat-label">
                  <i className={`vo-art-dot ${member?.online ? "online" : member ? "reserved" : "available"}`} />
                  {label}
                </span>
              </button>
            );
          })}
          <div className="vo-art-nameplate-layer" aria-label="Online employees">
            {nameplates.map((p) => (
              <span
                key={p.id}
                className="vo-seated-nameplate"
                style={{ left: p.x, top: p.y }}
                title={office.members.find((m) => m.id === p.id)?.name}
              >
                <i className="vo-art-dot online" />
                {office.members.find((m) => m.id === p.id)?.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="vo-art-heading">
        <strong>{office.departments.find((d) => d.id === departmentId)?.name ?? office.name}</strong>
        <small>
          Floor 1 · {office.departments.length} departments · {office.desks.length} workstations
        </small>
      </div>
      <div className="vo-art-legend">
        <span>
          <i className="vo-art-dot online" />
          Online
        </span>
        <span>
          <i className="vo-art-dot reserved" />
          Reserved · offline
        </span>
        <span>
          <i className="vo-art-dot available" />
          Available
        </span>
      </div>
      <div className="vo-art-controls" aria-label="Office view controls">
        <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
          Labels
        </button>
        <span>{zoom}%</span>
        <button aria-label="Zoom in" onClick={() => changeZoom(1.2)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => changeZoom(1 / 1.2)}>
          −
        </button>
        <button aria-label="Reset view" onClick={() => reset()}>
          ↻
        </button>
        <button
          aria-label="Toggle fullscreen"
          onClick={() => {
            const request = document.fullscreenElement
              ? document.exitFullscreen()
              : viewport.current?.parentElement?.requestFullscreen?.();
            void request?.catch(() => setFailed(true));
          }}
        >
          ⛶
        </button>
      </div>
      {failed && (
        <p className="vo-art-failure" role="status">
          Some office artwork or view controls are unavailable. Use Directory and List view to choose a desk.
        </p>
      )}
    </div>
  );
}
