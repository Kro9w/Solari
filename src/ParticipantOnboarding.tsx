import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";

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
    setLoading(true);
    setError(null);
    const { error: linkError } = await supabase.rpc("link_sinag_participant", {
      p_participant_id: participantId.trim(),
    });
    setLoading(false);
    if (linkError) {
      setError("We couldn't link that participant ID. Check the ID or contact an administrator.");
      return;
    }
    sessionStorage.removeItem("sinag_pending_participant_id");
    navigate("/", { replace: true });
  };

  return (
    <div className="auth-shell">
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h2 className="auth-heading">Link your participant record</h2>
          <p className="auth-subtext">Enter your TSI ID. Your verified email authenticates your account; the ID identifies the approved participant record and is not a password.</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={linkParticipant} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="participant-id">TSI Participant ID</label>
              <input id="participant-id" className="auth-input" autoComplete="off" value={participantId} onChange={(e) => setParticipantId(e.target.value)} required />
            </div>
            <button className="auth-submit-btn" type="submit" disabled={loading}>{loading ? "Linking…" : "Link participant ID"}</button>
          </form>
          <p className="auth-subtext">Signed in as {user?.email}</p>
        </div>
      </div>
    </div>
  );
}
