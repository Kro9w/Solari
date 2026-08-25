import { useState, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate, Link } from "react-router-dom";
import icon from "../icon.png";
import { withViewTransition } from "./utils/viewTransition";

const EXAM_DATE = new Date("2026-09-03");
const TICKS = Array.from({ length: 24 }, (_, i) => i);
const EXIT_MS = 260;

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    const normalizedSurname = lastName.trim().toLowerCase();

    // 1. Check if the surname is allowed (fetch all matches to handle duplicates)
    const { data: allowedDataList, error: allowedError } = await supabase
      .from("allowed_surnames")
      .select("*")
      .eq("surname", normalizedSurname);

    if (allowedError) {
      setError("Error validating surname. Please try again.");
      setLoading(false);
      return;
    }

    if (!allowedDataList || allowedDataList.length === 0) {
      setError("Your surname is not on the allowed list.");
      setLoading(false);
      return;
    }

    // 2. Find an unclaimed slot for this surname
    const availableSlot = allowedDataList.find((row) => !row.is_claimed);

    if (!availableSlot) {
      setError("This surname has already been registered.");
      setLoading(false);
      return;
    }

    // 3. Proceed with signup
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      // 4. Mark specific surname slot as claimed
      await supabase
        .from("allowed_surnames")
        .update({ is_claimed: true })
        .eq("id", availableSlot.id);

      withViewTransition(() => navigate("/"));
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
          <p className="auth-subtext">Set up your account to get started.</p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-field-row">
              <div className="auth-field">
                <label className="auth-field-label">
                  <span className="marc-tag">100</span> Personal Name
                </label>
                <div className="marc-input-group">
                  <div className="marc-indicator">0#</div>
                  <div className="marc-subfield">$a</div>
                  <input
                    className="auth-input marc-input"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="Name"
                  />
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-field-label">&nbsp;</label>
                <input
                  className="auth-input"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  placeholder="Last Name"
                />
              </div>
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
