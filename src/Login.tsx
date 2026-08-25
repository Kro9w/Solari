import { useState, useMemo, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import icon from "../icon.png";
import { withViewTransition } from "./utils/viewTransition";

const EXAM_DATE = new Date("2026-09-03");
const TICKS = Array.from({ length: 24 }, (_, i) => i);
const EXIT_MS = 260;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [modalMode, setModalMode] = useState<
    "none" | "forgot_password" | "update_password"
  >("none");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setModalMode("update_password");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
      withViewTransition(() => navigate("/"));
    }
  };

  return (
    <div className={`auth-shell ${leaving ? "leaving" : ""}`}>
      {/* ── brand panel ── */}
      <aside className="auth-brand-panel">
        <div className="auth-kicker">SINAG · SMRC Exam Portal</div>

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
            <img src={icon} alt="SINAG" className="auth-mark-icon" />
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
            <span>SINAG</span>
          </div>

          <h2 className="auth-heading">Log in</h2>
          <p className="auth-subtext">
            Pick up your review where you left off.
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label">
                <span className="marc-tag">856</span> Email
              </label>
              <div className="marc-input-group">
                <div className="marc-indicator">0#</div>
                <div className="marc-subfield">$u</div>
                <input
                  className="auth-input marc-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-field-label">
                <span className="marc-tag">856</span> Password
              </label>
              <div className="marc-input-group">
                <div className="marc-indicator">0#</div>
                <div className="marc-subfield">$k</div>
                <input
                  className="auth-input marc-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
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

          <div className="auth-switch">
            Forgot your password?{" "}
            <a
              href="#"
              className="auth-link"
              onClick={(e) => {
                e.preventDefault();
                setModalMode("forgot_password");
                setModalMessage(null);
                setModalError(null);
              }}
            >
              Reset it
            </a>
          </div>
        </div>
      </div>

      {/* ── forgot password modal ── */}
      {modalMode === "forgot_password" && (
        <div className="modal-overlay" style={{ backdropFilter: "blur(4px)" }}>
          <div
            className="modal-card"
            style={{ padding: "32px", maxWidth: "380px" }}
          >
            <div
              className="auth-form-inner"
              style={{ margin: "0", maxWidth: "100%" }}
            >
              <h2 className="auth-heading">Reset Password</h2>
              <p className="auth-subtext">
                Enter your email to receive a reset link.
              </p>

              {modalMessage && (
                <div
                  className="auth-error"
                  style={{
                    background: "var(--green-bg)",
                    color: "var(--green)",
                    borderLeftColor: "var(--green)",
                  }}
                >
                  {modalMessage}
                </div>
              )}
              {modalError && <div className="auth-error">{modalError}</div>}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setModalLoading(true);
                  setModalError(null);
                  setModalMessage(null);
                  const { error } = await supabase.auth.resetPasswordForEmail(
                    resetEmail,
                    {
                      redirectTo: window.location.origin,
                    },
                  );
                  if (error) {
                    setModalError(error.message);
                  } else {
                    setModalMessage("Check your email for the reset link.");
                  }
                  setModalLoading(false);
                }}
                className="auth-form"
              >
                <div className="auth-field">
                  <label className="auth-field-label">
                    <span className="marc-tag">856</span> Email
                  </label>
                  <div className="marc-input-group">
                    <div className="marc-indicator">0#</div>
                    <div className="marc-subfield">$u</div>
                    <input
                      className="auth-input marc-input"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  className="auth-submit-btn"
                  type="submit"
                  disabled={modalLoading}
                >
                  {modalLoading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
              <div className="auth-switch" style={{ marginTop: "16px" }}>
                <a
                  href="#"
                  className="auth-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setModalMode("none");
                  }}
                >
                  Back to login
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── update password modal ── */}
      {modalMode === "update_password" && (
        <div className="modal-overlay" style={{ backdropFilter: "blur(4px)" }}>
          <div
            className="modal-card"
            style={{ padding: "32px", maxWidth: "380px" }}
          >
            <div
              className="auth-form-inner"
              style={{ margin: "0", maxWidth: "100%" }}
            >
              <h2 className="auth-heading">Set New Password</h2>
              <p className="auth-subtext">Enter your new password below.</p>

              {modalMessage && (
                <div
                  className="auth-error"
                  style={{
                    background: "var(--green-bg)",
                    color: "var(--green)",
                    borderLeftColor: "var(--green)",
                  }}
                >
                  {modalMessage}
                </div>
              )}
              {modalError && <div className="auth-error">{modalError}</div>}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setModalError(null);
                  setModalMessage(null);

                  if (newPassword.length < 6) {
                    setModalError("Password must be at least 6 characters.");
                    return;
                  }
                  if (newPassword !== confirmPassword) {
                    setModalError("Passwords do not match.");
                    return;
                  }

                  setModalLoading(true);
                  const { error } = await supabase.auth.updateUser({
                    password: newPassword,
                  });
                  if (error) {
                    setModalError(error.message);
                    setModalLoading(false);
                  } else {
                    setModalMessage("Password updated successfully.");
                    setNewPassword("");
                    setConfirmPassword("");
                    await supabase.auth.signOut();
                    setTimeout(() => {
                      setModalMode("none");
                    }, 2000);
                  }
                }}
                className="auth-form"
              >
                <div className="auth-field">
                  <label className="auth-field-label">
                    <span className="marc-tag">856</span> New Password
                  </label>
                  <div className="marc-input-group">
                    <div className="marc-indicator">0#</div>
                    <div className="marc-subfield">$k</div>
                    <input
                      className="auth-input marc-input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-field-label">
                    <span className="marc-tag">856</span> Confirm Password
                  </label>
                  <div className="marc-input-group">
                    <div className="marc-indicator">0#</div>
                    <div className="marc-subfield">$k</div>
                    <input
                      className="auth-input marc-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  className="auth-submit-btn"
                  type="submit"
                  disabled={modalLoading}
                >
                  {modalLoading ? "Updating…" : "Update Password"}
                </button>
              </form>
              <div className="auth-switch" style={{ marginTop: "16px" }}>
                <a
                  href="#"
                  className="auth-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setModalMode("none");
                  }}
                >
                  Cancel
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
