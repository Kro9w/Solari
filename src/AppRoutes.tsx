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
  const [linkStatus, setLinkStatus] = useState<"checking" | "linked" | "unlinked" | "error">("checking");

  useEffect(() => {
    if (!session || !requireParticipant || requireAdmin) return;
    let active = true;
    supabase.rpc("is_sinag_participant_linked").then(({ data, error }) => {
      if (active) setLinkStatus(error ? "error" : data ? "linked" : "unlinked");
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
    if (linkStatus === "checking") return <Loader />;
    if (linkStatus === "error") return <div className="auth-form-inner">Unable to verify participant access. Please reload or contact an administrator.</div>;
    if (linkStatus === "unlinked" && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
    if (linkStatus === "linked" && location.pathname === "/onboarding") return <Navigate to="/" replace />;
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
