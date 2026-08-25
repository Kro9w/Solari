import { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import MockExam from "./MockExam";
import { loadJSON, saveJSON } from "./utils/storage";
import { useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
import { useNavigate } from "react-router-dom";
import icon from "../icon.png";

// ── default milestones
const DEFAULT_MILESTONES = [
  {
    id: "registration",
    label: "Board Registration",
    dateStr: "June 05 - August 04",
    color: "var(--green)",
    bg: "var(--green-bg)",
  },
  {
    id: "exam",
    label: "CBLEL Exam",
    dateStr: "2026-09-03",
    color: "var(--accent)",
    bg: "var(--accent-bg)",
  },
];

export type MilestoneData = (typeof DEFAULT_MILESTONES)[number];

function loadMilestones(): MilestoneData[] {
  return loadJSON("milestones", DEFAULT_MILESTONES);
}
function saveMilestones(ms: MilestoneData[]) {
  saveJSON("milestones", ms);
}

// ── subjects
export const DEFAULT_SUBJECTS = [
  { name: "Library Organization and Management", short: "LOM", weight: 20 },
  {
    name: "Reference, Bibliography, and User Services",
    short: "RBU",
    weight: 20,
  },
  { name: "Cataloging and Classification", short: "CC", weight: 20 },
  { name: "Indexing and Abstracting", short: "IA", weight: 15 },
  {
    name: "Collection Management (Selection and Acquisition)",
    short: "CM",
    weight: 15,
  },
  { name: "Information Technology", short: "IT", weight: 10 },
];

export function loadSubjects() {
  // Gracefully merge missing weights for existing users
  const loaded: typeof DEFAULT_SUBJECTS = loadJSON(
    "subjects",
    DEFAULT_SUBJECTS,
  );
  return loaded.map((s) => {
    if (s.weight) return s;
    const defaultSub = DEFAULT_SUBJECTS.find((ds) => ds.short === s.short);
    return { ...s, weight: defaultSub ? defaultSub.weight : 0 };
  });
}

export function isRestDay(
  date: Date,
  studyDays: number[] = [1, 2, 3, 4, 5, 6],
) {
  return !studyDays.includes(date.getDay());
}

export function getSubjectForDate(
  date: Date,
  startDateStr: string,
  subjects: typeof DEFAULT_SUBJECTS,
  cycleLength: number = 6,
  studyDays: number[] = [1, 2, 3, 4, 5, 6],
): {
  subject: string;
  short: string;
  weekNum: number;
  idx: number;
  weight?: number;
} {
  if (isRestDay(date, studyDays))
    return { subject: "Rest day", short: "Rest", weekNum: 0, idx: -1 };

  const ref = new Date(startDateStr);
  ref.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  // Count how many valid study days have passed since the start date
  let validDaysPassed = 0;
  const d = new Date(ref);
  while (d < target) {
    if (!isRestDay(d, studyDays)) {
      validDaysPassed++;
    }
    d.setDate(d.getDate() + 1);
  }

  const cycleNum = Math.floor(Math.max(validDaysPassed, 0) / cycleLength);
  const idx = cycleNum % subjects.length;
  const s = subjects[idx];
  return {
    subject: s.name,
    short: s.short,
    weekNum: cycleNum + 1,
    idx,
    weight: s.weight,
  };
}

export function getDaysUntil(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - now.getTime()) / 86400000);
}

// ── app
export default function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [today] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [isMockExamActive, setIsMockExamActive] = useState(false);

  const [milestones, setMilestones] = useState<MilestoneData[]>(loadMilestones);
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const examMs = milestones.find((m) => m.id === "exam")!;
  const examDate = new Date(examMs.dateStr);

  const adminEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(",") || [];
  const isAdmin = user?.email && adminEmails.includes(user.email);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div
      className="app-container"
      style={{
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(circle at 90% -8%, rgba(196,168,130,0.16), transparent 42%), " +
          "radial-gradient(circle at -8% 105%, rgba(160,82,45,0.09), transparent 40%), " +
          "var(--cream)",
        color: "var(--ink)",
        transition: "background 0.2s, color 0.2s",
      }}
    >
      {/* ── header ── */}
      <header
        style={{
          padding: "16px 28px",
          borderBottom: "1px solid var(--cream-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src={icon}
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "calc(21px * var(--scale, 1))",
                color: "var(--ink)",
                lineHeight: 1.2,
              }}
            >
              SolariWEB
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              style={{
                padding: "7px 14px",
                background: "transparent",
                color: "var(--ink-muted)",
                border: "1px solid var(--cream-border)",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "12px",
                letterSpacing: "0.03em",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--cream-border)";
                e.currentTarget.style.color = "var(--ink-muted)";
              }}
            >
              Admin
            </button>
          )}
          <button
            onClick={handleLogout}
            aria-label="Log out"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "var(--ink-faint)",
              border: "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--red)";
              e.currentTarget.style.background = "var(--red-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--ink-faint)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            ⏻
          </button>
        </div>
      </header>

      {/* ── main ── */}
      <main
        className="fade-in"
        style={{
          flex: 1,
          minHeight: 0 /* crucial for nested flex scrolling */,
          overflowY: "auto",
          padding: 0,
          display: "block",
          flexDirection: "column",
        }}
      >
        <Dashboard />
      </main>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--cream-border)",
  background: "var(--cream)",
  cursor: "pointer",
  fontSize: "calc(14px * var(--scale, 1))",
  color: "var(--ink-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-body)",
};
