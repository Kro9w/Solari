import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { isValidParticipantId, normalizeParticipantId } from "./utils/participantId";
import icon from "../icon.png";

export default function ParticipantOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [participantId, setParticipantId] = useState(
    () => sessionStorage.getItem("sinag_pending_participant_id") ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const linkParticipant = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedId = normalizeParticipantId(participantId);
    if (!isValidParticipantId(normalizedId)) {
      setError("Enter a TSI ID in the format TSI-P260001.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: linkError } = await supabase.rpc("link_sinag_participant", {
      p_participant_id: normalizedId,
    });
    setLoading(false);
    if (linkError) {
      setError("We couldn't link this TSI ID. It may be invalid or unavailable. Confirm your ID with an administrator if you need help.");
      return;
    }
    sessionStorage.removeItem("sinag_pending_participant_id");
    navigate("/", { replace: true });
  };

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
          <h2 className="auth-heading">Link your participant record</h2>
          <p className="auth-subtext">Enter the TSI ID issued for your participant record. Your verified email authenticates your account; the ID is not a password.</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={linkParticipant} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="participant-id">TSI Participant ID</label>
              <input id="participant-id" className="auth-input" autoComplete="off" autoCapitalize="characters" placeholder="TSI-P260001" value={participantId} onChange={(e) => setParticipantId(e.target.value)} required />
            </div>
            <button className="auth-submit-btn" type="submit" disabled={loading}>{loading ? "Linking…" : "Link participant ID"}</button>
          </form>
          <p className="auth-subtext">Signed in as {user?.email}</p>
        </div>
      </div>
    </div>
  );
}
