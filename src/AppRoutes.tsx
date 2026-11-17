import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import App from "./App";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./Login";
import Signup from "./Signup";
import AdminDashboard from "./AdminDashboard";
import MockExam from "./MockExam";
import { Loader } from "./components/Loader";
import ParticipantOnboarding from "./ParticipantOnboarding";
import { supabase } from "./lib/supabase";

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
  const location = useLocation();
  const [linkStatus, setLinkStatus] = useState<{
    userId: string;
    status: "checking" | "linked" | "unlinked" | "error";
  } | null>(null);

  useEffect(() => {
    if (!session || !session.user.email_confirmed_at || !requireParticipant || requireAdmin) return;
    let active = true;
    setLinkStatus({ userId: session.user.id, status: "checking" });
    supabase.rpc("is_sinag_participant_linked").then(({ data, error }) => {
      if (active) setLinkStatus({ userId: session.user.id, status: error ? "error" : data ? "linked" : "unlinked" });
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
      return <Navigate to="/login" replace state={{ notice: "Verify your email before continuing." }} />;
    }
    if (linkStatus?.userId !== session.user.id || linkStatus.status === "checking") return <Loader />;
    if (linkStatus.status === "error") return <div className="auth-form-inner">Unable to verify participant access. Please reload or contact an administrator.</div>;
    if (linkStatus.status === "unlinked" && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
    if (linkStatus.status === "linked" && location.pathname === "/onboarding") return <Navigate to="/" replace />;
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
          <Route path="/onboarding" element={<ProtectedRoute><ParticipantOnboarding /></ProtectedRoute>} />

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
