import { useAuth } from "../../contexts/AuthContext";

export function NoAccess() {
  const { logout, currentUser } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 dark">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Pending</h1>
          <p className="text-zinc-400 mb-2">
            Your account has been created successfully, but you don't have access yet.
          </p>
          <p className="text-zinc-400 mb-6">
            Please contact an administrator to assign you a role.
          </p>
          <div className="bg-zinc-800 rounded p-4 mb-6">
            <p className="text-sm text-zinc-500">Logged in as:</p>
            <p className="text-white font-medium">{currentUser?.email}</p>
          </div>
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
