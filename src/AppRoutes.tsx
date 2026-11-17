import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./Login";
import Signup from "./Signup";
import AdminDashboard from "./AdminDashboard";
import MockExam from "./MockExam";
import { Loader } from "./components/Loader";
import { supabase } from "./lib/supabase";

type ParticipantGate = {
  userId: string;
  status: "checking" | "linking" | "ready" | "error";
};

const ProtectedRoute = ({
  children,
  requireAdmin = false,
  requireParticipant = true,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireParticipant?: boolean;
}) => {
  const { session, loading } = useAuth();
  const [participantGate, setParticipantGate] = useState<ParticipantGate | null>(null);
  const linkingRequest = useRef<{ userId: string; promise: Promise<boolean> } | null>(null);

  const ensureParticipantLinked = (userId: string, retry = false) => {
    if (!retry && linkingRequest.current?.userId === userId) {
      return linkingRequest.current.promise;
    }

    const promise = (async () => {
      const { data: alreadyLinked, error: statusError } = await supabase.rpc(
        "is_sinag_participant_linked",
      );
      if (statusError) return false;
      if (alreadyLinked) return true;

      const { error: linkError } = await supabase.rpc(
        "complete_sinag_participant_link",
      );
      if (linkError) return false;

      const { data: linkedAfter, error: verifyError } = await supabase.rpc(
        "is_sinag_participant_linked",
      );
      return !verifyError && linkedAfter === true;
    })();

    linkingRequest.current = { userId, promise };
    return promise;
  };

  useEffect(() => {
    if (!session || !session.user.email_confirmed_at || !requireParticipant || requireAdmin) return;
    let active = true;
    setParticipantGate({ userId: session.user.id, status: "checking" });
    ensureParticipantLinked(session.user.id).then((linked) => {
      if (active) {
        setParticipantGate({
          userId: session.user.id,
          status: linked ? "ready" : "error",
        });
      }
    });
    return () => { active = false; };
  }, [session?.user.id, requireParticipant, requireAdmin]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          justifyContent: "center",
          alignItems: "center",
          background: "var(--cream)",
        }}
      >
        <Loader />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin) {
    const adminEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(",") || [];
    if (!adminEmails.includes(session.user.email)) {
      return <Navigate to="/" replace />;
    }
  }

  if (requireParticipant && !requireAdmin) {
    if (!session.user.email_confirmed_at) {
      return <Navigate to="/login" replace state={{ notice: "Your account is not ready for participant access. Contact an administrator." }} />;
    }
    if (participantGate?.userId !== session.user.id || participantGate.status === "checking" || participantGate.status === "linking") {
      return <Loader />;
    }
    if (participantGate.status === "error") {
      const retryLink = async () => {
        setParticipantGate({ userId: session.user.id, status: "linking" });
        const linked = await ensureParticipantLinked(session.user.id, true);
        setParticipantGate({ userId: session.user.id, status: linked ? "ready" : "error" });
      };
      return (
        <div className="auth-shell">
          <div className="auth-form-panel">
            <div className="auth-form-inner">
              <h2 className="auth-heading">We couldn’t finish account setup</h2>
              <p className="auth-subtext">Your TSI ID could not be linked to this account. Please contact an administrator for help.</p>
              <button className="auth-submit-btn" type="button" onClick={retryLink}>Try again</button>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            }
          />

          <Route
            path="/exam/:examId"
            element={
              <ProtectedRoute>
                <MockExam isRestDay={false} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
