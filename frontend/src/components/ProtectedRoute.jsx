import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute({ children, masterOnly = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="h-screen flex items-center justify-center font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (masterOnly && !user.is_master) return <Navigate to="/dashboard" replace />;
  // Force non-master users without business_type to onboarding
  if (!user.is_master && !user.business_type && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
