import { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import MockExam from "./MockExam";
import Admin from "./Admin";
import Auth from "./Auth";
import { BottomNav } from "./components/BottomNav";
import { SettingsPage } from "./components/SettingsPage";
import { loadJSON, saveJSON } from "./utils/storage";
import { supabase } from "./utils/supabase";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [activeTab, setActiveTab] = useState(() => {
    return loadJSON<string>("activeTab", "dashboard");
  });

  const [darkMode, setDarkMode] = useState(() =>
    loadJSON<boolean>("darkMode", true),
  );
  const [simpleFont, setSimpleFont] = useState(() =>
    loadJSON<boolean>("simpleFont", false),
  );
  const [fontSize, setFontSize] = useState<"S" | "M" | "L">(() =>
    loadJSON<"S" | "M" | "L">("fontSize", "M"),
  );

  const [isMockExamActive, setIsMockExamActive] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    saveJSON("activeTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.className = darkMode ? "dark" : "light";
    saveJSON("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (simpleFont) {
      document.documentElement.style.setProperty(
        "--font-display",
        "'Inter', system-ui, sans-serif",
      );
      document.documentElement.style.setProperty(
        "--font-body",
        "'Inter', system-ui, sans-serif",
      );
    } else {
      document.documentElement.style.setProperty(
        "--font-display",
        "'Newsreader', serif",
      );
      document.documentElement.style.setProperty(
        "--font-body",
        "'Inter', system-ui, sans-serif",
      );
    }
    saveJSON("simpleFont", simpleFont);
  }, [simpleFont]);

  useEffect(() => {
    const scaleMap = { S: 0.9, M: 1, L: 1.1 };
    document.documentElement.style.setProperty(
      "--scale",
      scaleMap[fontSize].toString(),
    );
    saveJSON("fontSize", fontSize);
  }, [fontSize]);

  if (loadingSession) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  // Handle direct admin route (requires login)
  if (window.location.pathname === "/admin") {
    return <Admin />;
  }

  return (
    <div className={`app-container ${isMockExamActive ? "fullscreen" : ""}`}>
      {/* ── header ── */}
      {!isMockExamActive && (
        <header
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "max(16px, env(safe-area-inset-top))",
            flexShrink: 0,
            background: "var(--cream)",
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "calc(24px * var(--scale, 1))",
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "-0.02em",
            }}
          >
            Exam Portal
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setActiveTab("settings")}
              className="hide-on-mobile"
              style={navBtn}
            >
              ⚙️
            </button>
          </div>
        </header>
      )}

      {/* ── main ── */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "var(--cream)",
          position: "relative",
          minHeight: 0,
        }}
      >
        {activeTab === "dashboard" && <Dashboard />}

        {activeTab === "practice" && (
          <MockExam
            onActiveChange={setIsMockExamActive}
            hideOnboarding={true}
          />
        )}

        {activeTab === "settings" && (
          <SettingsPage
            updateAvailable={false}
            latestRelease={null}
            onOpenUpdateModal={() => {}}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            simpleFont={simpleFont}
            setSimpleFont={setSimpleFont}
            fontSize={fontSize}
            setFontSize={setFontSize}
            enableStreak={false}
            setEnableStreak={() => {}}
            enablePomodoro={false}
            setEnablePomodoro={() => {}}
          />
        )}
      </main>

      {!isMockExamActive && (
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      )}
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
