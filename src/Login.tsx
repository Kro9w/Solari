import { useState, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import icon from "../icon.png";

const EXAM_DATE = new Date("2026-09-03");
const TICKS = Array.from({ length: 24 }, (_, i) => i);
const EXIT_MS = 260;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();

  const goToSignup = (e: React.MouseEvent) => {
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => navigate("/signup"), EXIT_MS);
  };

  const daysToExam = useMemo(() => {
    const diff = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
    return Math.max(0, diff);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate("/");
    }
  };

  return (
    <div className={`auth-shell ${leaving ? "leaving" : ""}`}>
      {/* ── brand panel ── */}
      <aside className="auth-brand-panel">
        <div className="auth-kicker">SolariWEB · CBLEL Exam Portal</div>

        <div className="auth-brand-center">
          <div className="auth-mark-wrap">
            <div className="auth-mark-glow" />
            <svg
              className="auth-mark-ring"
              viewBox="0 0 200 200"
              aria-hidden="true"
            >
              <g className="auth-ring-group">
                {TICKS.map((i) => {
                  const angle = (i * 15 * Math.PI) / 180;
                  const isMajor = i % 6 === 0;
                  const rOuter = 96;
                  const rInner = isMajor ? 78 : 87;
                  const x1 = 100 + rOuter * Math.sin(angle);
                  const y1 = 100 - rOuter * Math.cos(angle);
                  const x2 = 100 + rInner * Math.sin(angle);
                  const y2 = 100 - rInner * Math.cos(angle);
                  return (
                    <line
                      key={i}
                      className="auth-tick"
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={
                        isMajor
                          ? "var(--accent-light)"
                          : "rgba(245,241,234,0.35)"
                      }
                      strokeWidth={isMajor ? 2 : 1}
                      strokeLinecap="round"
                      style={
                        {
                          animationDelay: `${i * 0.03}s`,
                          "--tick-opacity": isMajor ? 1 : 0.7,
                        } as React.CSSProperties
                      }
                    />
                  );
                })}
              </g>
            </svg>
            <img src={icon} alt="SolariWEB" className="auth-mark-icon" />
          </div>

          <div className="auth-countdown">
            <span className="auth-countdown-line" />
            {daysToExam} {daysToExam === 1 ? "day" : "days"} to the CBLEL exam
            <span className="auth-countdown-line" />
          </div>

          <p className="auth-pullquote">Kaya mo yan!</p>
        </div>

        <div className="auth-brand-footer">CBLEL · 2026</div>
      </aside>

      {/* ── form panel ── */}
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-mobile-mark">
            <img src={icon} alt="" />
            <span>SolariWEB</span>
          </div>

          <h2 className="auth-heading">Log in</h2>
          <p className="auth-subtext">
            Pick up your review where you left off.
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label">Email</label>
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-field-label">Password</label>
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              className="auth-submit-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <div className="auth-switch">
            Don't have an account?{" "}
            <Link to="/signup" className="auth-link" onClick={goToSignup}>
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
