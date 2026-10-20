import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { OfficeDesk, OfficeState } from "../../services/virtual-office.service";
import { departmentAreas, deskLocation, fitOfficeCamera, zoomOfficeCamera } from "./isometric-layout";
import type { OfficeCamera } from "./isometric-layout";

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
  const focusedOrder = office.departments.find((d) => d.id === departmentId)?.order;
  const focus = useRef(focusedOrder);
  focus.current = focusedOrder;
  function paint(next: OfficeCamera) {
    camera.current = next;
    if (world.current) world.current.style.transform = `translate(${next.x}px,${next.y}px) scale(${next.scale})`;
    setZoom(Math.round((next.scale / fitScale.current) * 100));
  }
  function reset(order?: number) {
    const host = viewport.current;
    if (!host) return;
    const next = fitOfficeCamera(host.clientWidth, host.clientHeight);
    fitScale.current = next.scale;
    const area = order === undefined ? undefined : departmentAreas[order];
    if (area) {
      const points = Array.from({ length: area.count }, (_, i) => deskLocation(order!, i + 1)!);
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      next.scale *= 1.7;
      next.x = host.clientWidth / 2 - x * next.scale;
      next.y = host.clientHeight / 2 - (y - 35) * next.scale;
    }
    paint(next);
  }
  function changeZoom(factor: number, point?: { x: number; y: number }) {
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
  }
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
  }, []);
  useEffect(() => {
    reset(focusedOrder);
  }, [focusedOrder, resetKey]);
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
        <div ref={world} className={`vo-art-world ${labels ? "" : "vo-hide-art-labels"}`}>
          <img
            className="vo-art-environment"
            src="/virtual-office/art-v1/office-environment.png"
            alt="Office with glass walls, plants and flowers, meeting room, lounge and reception"
            draggable={false}
            onError={() => setFailed(true)}
          />

          {office.departments.map((d) => {
            const area = departmentAreas[d.order];
            return area ? (
              <button
                key={d.id}
                className={`vo-art-zone ${departmentId !== null && departmentId !== d.id ? "dimmed" : ""}`}
                style={{ left: area.x + 25, top: area.y - 105, "--vo-department": d.color } as CSSProperties}
                onClick={() => onDepartment(d.id)}
              >
                <strong>{d.name}</strong>
                <small>{office.desks.filter((desk) => desk.department_id === d.id).length} desks</small>
              </button>
            ) : null;
          })}
          {office.desks.map((desk) => {
            const department = office.departments.find((d) => d.id === desk.department_id);
            if (!department) return null;
            const point = deskLocation(
              department.order,
              desk.number,
              office.desks.filter((d) => d.department_id === department.id).length
            );
            if (!point) return null;
            const member = office.members.find((m) => m.id === desk.member_id);
            const label = `${departmentAreas[department.order].code}-${String(desk.number).padStart(2, "0")}`;
            return (
              <button
                key={desk.id}
                className={`vo-art-seat ${selectedId === desk.id ? "selected" : ""} ${departmentId !== null && departmentId !== department.id ? "dimmed" : ""}`}
                style={
                  {
                    left: point.x,
                    top: point.y,
                    zIndex: Math.round(point.y),
                    "--vo-department": department.color,
                  } as CSSProperties
                }
                aria-label={`${label}, ${member ? `reserved by ${member.name}, ${member.online ? "online" : "offline"}` : "available"}`}
                aria-pressed={selectedId === desk.id}
                onClick={() => onSelect(desk)}
              >
                <img
                  className="vo-art-workstation"
                  src={
                    member?.online
                      ? "/virtual-office/art-v1/workstation-occupied.png"
                      : "/virtual-office/art-v1/workstation.png"
                  }
                  alt=""
                  draggable={false}
                  onError={() => setFailed(true)}
                />
                <span className="vo-art-seat-label">
                  <i className={`vo-art-dot ${member?.online ? "online" : member ? "reserved" : "available"}`} />
                  {label}
                </span>
                {member?.online && (
                  <span className="vo-art-avatar" aria-hidden="true">
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                )}
              </button>
            );
          })}
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
