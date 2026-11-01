import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import interRegular from "@/app/assets/fonts/inter/regular.ttf?url";
import interBold from "@/app/assets/fonts/inter/bold.ttf?url";
import type { AttendanceReport } from "../../services/virtual-office.service";

Font.register({
  family: "OfficeInter",
  fonts: [
    { src: interRegular, fontWeight: 400 },
    { src: interBold, fontWeight: 700 },
  ],
});
const styles = StyleSheet.create({
  page: { padding: 30, paddingTop: 105, paddingBottom: 44, fontFamily: "OfficeInter", fontSize: 9, color: "#18212f" },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 6 },
  header: { position: "absolute", top: 28, left: 30, right: 30 },
  meta: { fontSize: 8, marginBottom: 5 },
  record: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#cbd5e1" },
  name: { fontSize: 11, fontWeight: 700, marginBottom: 5 },
  fields: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", paddingRight: 12, marginBottom: 8 },
  fullField: { width: "100%" },
  label: { fontSize: 8, fontWeight: 700, marginBottom: 2 },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, fontSize: 8 },
});

export function AttendancePDF({ report }: { report: AttendanceReport }) {
  return (
    <Document title="PathBuilder attendance" author="PathBuilder Sync">
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.header}>
          <Text style={styles.title}>PathBuilder Sync · Attendance</Text>
          <Text style={styles.meta}>
            {report.filters.start_date} → {report.filters.end_date} · {report.rows.length} sessions · Asia/Manila
          </Text>
          <Text style={styles.meta}>
            Generated {report.generated_at} · Report {report.id}
          </Text>
          <Text style={styles.meta}>
            Employee filter: {report.filters.member_id || "All"} · Department filter:{" "}
            {report.filters.department_id || "All"}
          </Text>
        </View>
        {report.rows.length === 0 && <Text>No attendance records match these filters.</Text>}
        {report.rows.map((row, index) => (
          <View key={row.id} style={styles.record} wrap={false}>
            <Text style={styles.name} minPresenceAhead={40}>
              {index + 1}. {row.employee_name || "Legacy record"} · {row.attendance_date}
            </Text>
            <View style={styles.fields}>
              {report.columns.map(([key, title]) => {
                const value = row[key];
                const formatted =
                  value === null || value === undefined || value === ""
                    ? "—"
                    : typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : String(value).replace(/\s+/g, " ");
                return (
                  <View
                    key={key}
                    wrap={false}
                    style={[styles.field, ...(key === "reason" || key === "employee_reason" ? [styles.fullField] : [])]}
                  >
                    <Text style={styles.label}>{title}</Text>
                    <Text>{formatted}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Attendance · All matching records · ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function downloadAttendancePDF(report: AttendanceReport): Promise<void> {
  const blob = await pdf(<AttendancePDF report={report} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${report.id}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
