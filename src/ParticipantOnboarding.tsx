import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import icon from "../icon.png";

export default function ParticipantOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const linkParticipant = async () => {
    setLoading(true);
    setError(null);
    const { error: linkError } = await supabase.rpc("complete_sinag_participant_link");
    setLoading(false);
    if (linkError) {
      setError("We couldn't complete participant linking. Sign out and sign in again, or contact an administrator.");
      return;
    }
    navigate("/", { replace: true });
  };

  useEffect(() => {
    void linkParticipant();
    // The RPC is idempotent for the same authenticated user and participant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="auth-kicker">SINAG · SMRC Exam Portal</div>
        <div className="auth-brand-center">
          <div className="auth-mark-wrap">
            <div className="auth-mark-glow" />
            <img src={icon} alt="SINAG" className="auth-mark-icon" />
          </div>
          <p className="auth-pullquote">Your participant record, securely linked.</p>
        </div>
        <div className="auth-brand-footer">CBLEL · 2026</div>
      </aside>
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-mobile-mark">
            <img src={icon} alt="" />
            <span>SINAG</span>
          </div>
          <h2 className="auth-heading">Finish setting up your account</h2>
          <p className="auth-subtext">Your TSI ID was checked during signup. After signing in with your email and password, your issued participant record links automatically. Your TSI ID is not a password.</p>
          {error && <div className="auth-error">{error}</div>}
          {loading ? (
            <p className="auth-subtext" role="status">Linking your participant record…</p>
          ) : (
            <button className="auth-submit-btn" type="button" onClick={linkParticipant}>Try linking again</button>
          )}
          <p className="auth-subtext">Signed in as {user?.email}</p>
        </div>
      </div>
    </div>
  );
}
