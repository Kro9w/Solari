import { useState, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import icon from "../icon.png";
import { withViewTransition } from "./utils/viewTransition";
import { isValidParticipantId, normalizeParticipantId } from "./utils/participantId";

const EXAM_DATE = new Date("2026-09-03");
const TICKS = Array.from({ length: 24 }, (_, i) => i);
const EXIT_MS = 260;

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();

  const goToLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => navigate("/login"), EXIT_MS);
  };

  const daysToExam = useMemo(() => {
    const diff = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
    return Math.max(0, diff);
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isValidParticipantId(participantId)) {
      setError("This is not a valid TSI ID. Please contact our Programs Director if you think this is a mistake.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    // The server checks the issued ID and binds it to the new Auth user in
    // server-managed app_metadata. Passwords are forwarded to Supabase Auth
    // and are never logged or stored by this application.
    const { error: signUpError } = await supabase.functions.invoke("sinag-signup", {
      body: {
        email: email.trim(),
        password,
        participantId: normalizeParticipantId(participantId),
      },
    });

    if (signUpError) {
      setError("We couldn't start signup. Check your TSI ID and email, or contact an administrator if the problem continues.");
      setLoading(false);
    } else {
      withViewTransition(() => navigate("/login", { state: { notice: "If your TSI ID and signup details can be registered, your account is ready. Sign in with the email and password you chose to finish setup." } }));
    }
  };

  return (
    <div className={`auth-shell reverse ${leaving ? "leaving" : ""}`}>
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

          <p className="auth-pullquote">Your journey starts here.</p>
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

          <h2 className="auth-heading">Create your entry</h2>
          <p className="auth-subtext">Create an account with your email and choose your password. Your issued TSI ID confirms you are an approved reviewee.</p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="signup-participant-id">TSI Participant ID</label>
              <input
                id="signup-participant-id"
                className="auth-input"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                required
                placeholder="TSI-P… or TSI-V…"
              />
              <small className="auth-field-help">Your TSI ID confirms an issued participant record. It is not your password; sign in with the email and password you choose.</small>
            </div>
            <div className="auth-field">
              <label className="auth-field-label">
                <span className="marc-tag">856</span> Email
              </label>
              <div className="marc-input-group">
                <div className="marc-indicator">0#</div>
                <div className="marc-subfield">$u</div>
                <input
                  className="auth-input marc-input"
                  autoComplete="email"
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="signup-confirm-password">
                <span className="marc-tag">856</span> Confirm Password
              </label>
              <div className="marc-input-group">
                <div className="marc-indicator">0#</div>
                <div className="marc-subfield">$k</div>
                <input
                  id="signup-confirm-password"
                  className="auth-input marc-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              className="auth-submit-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{" "}
            <Link to="/login" className="auth-link" onClick={goToLogin}>
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
