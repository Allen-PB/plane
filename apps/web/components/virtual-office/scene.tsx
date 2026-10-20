import type { OfficeState, OfficeDesk, OfficeDepartment } from "../../services/virtual-office.service";

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

export function OfficeScene({
  office,
  selectedId,
  onSelect,
}: {
  office: OfficeState;
  selectedId: number | null;
  onSelect: (desk: OfficeDesk) => void;
}) {
  return (
    <div className="vo-scene-scroll" aria-label="Interactive isometric office">
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
