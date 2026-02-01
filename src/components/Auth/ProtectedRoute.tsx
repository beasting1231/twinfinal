import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Onboarding } from "./Onboarding";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, userRole, userProfile, loading } = useAuth();

  // Redirect to login if not authenticated (and not loading)
  if (!loading && !currentUser) {
    return <Navigate to="/login" replace />;
  }

  // If still loading auth state, show skeleton (brief, auth state is cached)
  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 p-4">
        <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(5, 160px) 48px 98px 98px` }}>
          {/* Header Row Skeleton */}
          <div className="h-7" />
          <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
          <div className="h-7 w-full" />
          <div className="h-7 bg-yellow-400/80 rounded-lg animate-pulse" />
          <div className="h-7 bg-yellow-400/80 rounded-lg animate-pulse" />

          {/* Time Slot Rows Skeleton (4 rows for brevity) */}
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="contents">
              <div className="h-20 bg-zinc-900 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 w-full" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show onboarding if profile loaded and not completed
  if (!loading && userProfile && !userProfile.onboardingComplete) {
    return <Onboarding />;
  }

  // Show no access screen if profile loaded but no role
  if (!loading && userProfile && !userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-full max-w-md p-8 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Access Pending
          </h2>
          <p className="text-zinc-400 text-center mb-6">
            Your account is being reviewed. Please check back later or contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  // Show app with cached data (even if profile still loading)
  // This allows instant grid display while profile fetch completes in background
  return (
    <>
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 animate-pulse" style={{ width: '70%', transition: 'width 0.3s ease' }}></div>
        </div>
      )}
      {children}
    </>
  );
}
