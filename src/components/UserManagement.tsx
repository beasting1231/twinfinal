import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile, UserRole } from "../types";
import { APP_VERSION } from "../version";

// Helper to format relative time
function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedRoles, setEditedRoles] = useState<Record<string, UserRole>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "userProfiles"));
      const usersData = querySnapshot.docs.map((doc) => ({
        ...doc.data(),
      })) as UserProfile[];

      // Sort by role (admins first, then by name)
      usersData.sort((a, b) => {
        const getRoleOrder = (role: UserRole): number => {
          if (role === "admin") return 0;
          if (role === "driver") return 1;
          if (role === "agency") return 2;
          if (role === "pilot") return 3;
          return 4; // null
        };
        const aOrder = getRoleOrder(a.role || null);
        const bOrder = getRoleOrder(b.role || null);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.displayName || "").localeCompare(b.displayName || "");
      });

      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    setEditedRoles((prev) => ({
      ...prev,
      [userId]: newRole,
    }));
    setOpenDropdownId(null);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      // Update all changed roles
      const updatePromises = Object.entries(editedRoles).map(([userId, newRole]) =>
        updateDoc(doc(db, "userProfiles", userId), {
          role: newRole,
          updatedAt: new Date(),
        })
      );

      await Promise.all(updatePromises);

      // Update local state
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          editedRoles[user.uid] !== undefined
            ? { ...user, role: editedRoles[user.uid] }
            : user
        )
      );

      // Clear edited roles
      setEditedRoles({});
    } catch (error) {
      console.error("Error updating user roles:", error);
      alert("Failed to update user roles. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const getCurrentRole = (user: UserProfile): UserRole | undefined => {
    return editedRoles[user.uid] !== undefined ? editedRoles[user.uid] : user.role;
  };

  const handleNameDoubleClick = (user: UserProfile) => {
    setEditingNameId(user.uid);
    setEditingNameValue(user.displayName || "");
  };

  const handleNameSave = async (userId: string, oldDisplayName: string) => {
    const newDisplayName = editingNameValue.trim();
    if (!newDisplayName || newDisplayName === oldDisplayName) {
      setEditingNameId(null);
      return;
    }

    try {
      // Update user profile
      await updateDoc(doc(db, "userProfiles", userId), {
        displayName: newDisplayName,
        updatedAt: new Date(),
      });

      // Update all bookings with the old name
      const bookingsSnapshot = await getDocs(collection(db, "bookings"));
      const updatePromises: Promise<void>[] = [];

      bookingsSnapshot.docs.forEach((bookingDoc) => {
        const bookingData = bookingDoc.data();
        let needsUpdate = false;
        const updates: Record<string, unknown> = {};

        // Update assignedPilots array
        if (bookingData.assignedPilots && Array.isArray(bookingData.assignedPilots)) {
          const updatedAssignedPilots = bookingData.assignedPilots.map((pilot: string) =>
            pilot === oldDisplayName ? newDisplayName : pilot
          );
          if (JSON.stringify(updatedAssignedPilots) !== JSON.stringify(bookingData.assignedPilots)) {
            updates.assignedPilots = updatedAssignedPilots;
            needsUpdate = true;
          }
        }

        // Update pilotPayments array
        if (bookingData.pilotPayments && Array.isArray(bookingData.pilotPayments)) {
          const updatedPilotPayments = bookingData.pilotPayments.map((payment: { pilotName: string }) =>
            payment.pilotName === oldDisplayName
              ? { ...payment, pilotName: newDisplayName }
              : payment
          );
          if (JSON.stringify(updatedPilotPayments) !== JSON.stringify(bookingData.pilotPayments)) {
            updates.pilotPayments = updatedPilotPayments;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          updatePromises.push(updateDoc(doc(db, "bookings", bookingDoc.id), updates));
        }
      });

      await Promise.all(updatePromises);

      // Update local state
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.uid === userId ? { ...user, displayName: newDisplayName } : user
        )
      );
    } catch (error) {
      console.error("Error updating display name:", error);
      alert("Failed to update display name. Please try again.");
    } finally {
      setEditingNameId(null);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent, userId: string, oldDisplayName: string) => {
    if (e.key === "Enter") {
      handleNameSave(userId, oldDisplayName);
    } else if (e.key === "Escape") {
      setEditingNameId(null);
    }
  };

  const hasChanges = Object.keys(editedRoles).length > 0;

  const handleMwstToggle = async (userId: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, "userProfiles", userId), {
        mwst: !currentValue,
        updatedAt: new Date(),
      });
      // Update local state
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.uid === userId ? { ...user, mwst: !currentValue } : user
        )
      );
    } catch (error) {
      console.error("Error updating MWST:", error);
      alert("Failed to update MWST. Please try again.");
    }
  };

  const getRoleBadgeColor = (role: UserRole | undefined) => {
    switch (role) {
      case "admin":
        return "bg-red-900 text-red-200";
      case "driver":
        return "bg-blue-900 text-blue-200";
      case "agency":
        return "bg-purple-900 text-purple-200";
      case "pilot":
        return "bg-green-900 text-green-200";
      default:
        return "bg-zinc-700 text-zinc-300";
    }
  };

  const getRoleDisplayName = (role: UserRole | undefined) => {
    return role || "No Access";
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-600 dark:text-zinc-400">Loading users...</div>
      </div>
    );
  }

  const roles: { value: UserRole; label: string }[] = [
    { value: null, label: "No Access" },
    { value: "pilot", label: "Pilot" },
    { value: "agency", label: "Agency" },
    { value: "driver", label: "Driver" },
    { value: "admin", label: "Admin" },
  ];

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-6 pb-48">
      <div className="max-w-4xl mx-auto overflow-visible">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          {hasChanges && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
        {/* Current version indicator */}
        <div className="mb-4 text-sm text-gray-600 dark:text-zinc-400">
          Current version: <span className="font-mono text-gray-900 dark:text-white">{APP_VERSION}</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 overflow-visible">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800">
                <th className="text-left p-2 sm:p-4 text-gray-600 dark:text-zinc-400 font-medium w-[30%] sm:w-[20%]">Name</th>
                <th className="text-left p-2 sm:p-4 text-gray-600 dark:text-zinc-400 font-medium hidden sm:table-cell sm:w-[20%]">Email</th>
                <th className="text-left p-2 sm:p-4 text-gray-600 dark:text-zinc-400 font-medium w-[20%] sm:w-[15%]">Version</th>
                <th className="text-left p-2 sm:p-4 text-gray-600 dark:text-zinc-400 font-medium w-[25%] sm:w-[25%]">Role</th>
                <th className="text-center p-2 sm:p-4 text-gray-600 dark:text-zinc-400 font-medium w-[25%] sm:w-[20%]">MWST</th>
              </tr>
            </thead>
            <tbody className="overflow-visible">
              {users.map((user, index) => {
                const currentRole = getCurrentRole(user);
                const isOpen = openDropdownId === user.uid;
                const isNearBottom = index >= users.length - 3;
                const isOutdated = user.appVersion && user.appVersion !== APP_VERSION;

                return (
                  <tr
                    key={user.uid}
                    className="border-b border-gray-200 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors overflow-visible"
                  >
                    <td className="p-2 sm:p-4">
                      {editingNameId === user.uid ? (
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onBlur={() => handleNameSave(user.uid, user.displayName)}
                          onKeyDown={(e) => handleNameKeyDown(e, user.uid, user.displayName)}
                          autoFocus
                          className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-800 border border-blue-500 rounded outline-none text-gray-900 dark:text-white"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => handleNameDoubleClick(user)}
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 rounded px-1 -mx-1"
                          title="Double-click to edit"
                        >
                          <div className="text-gray-900 dark:text-white truncate">{user.displayName}</div>
                          <div className="text-xs text-gray-500 dark:text-zinc-500 truncate sm:hidden">{user.email}</div>
                        </div>
                      )}
                    </td>
                    <td className="p-2 sm:p-4 text-gray-600 dark:text-zinc-400 truncate hidden sm:table-cell" title={user.email}>{user.email}</td>
                    <td className="p-2 sm:p-4">
                      <div className={`text-xs font-mono flex items-center gap-1 ${isOutdated ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-zinc-400'}`}>
                        {user.appVersion || '—'}
                        {user.appVersion === APP_VERSION && (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-zinc-500">
                        {formatRelativeTime(user.lastActiveAt)}
                      </div>
                    </td>
                    <td className="p-2 sm:p-4 overflow-visible">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setOpenDropdownId(isOpen ? null : user.uid)
                          }
                          className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity ${getRoleBadgeColor(
                            currentRole
                          )}`}
                        >
                          <span className="truncate max-w-[80px] sm:max-w-none">{getRoleDisplayName(currentRole)}</span>
                          <svg
                            className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>

                        {isOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenDropdownId(null)}
                            />
                            <div className={`absolute z-20 py-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg min-w-[160px] left-0 ${isNearBottom ? 'bottom-full mb-2' : 'mt-2'}`}>
                              {roles.map((roleOption) => (
                                <button
                                  key={roleOption.label}
                                  onClick={() =>
                                    handleRoleChange(user.uid, roleOption.value)
                                  }
                                  className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors ${
                                    currentRole === roleOption.value
                                      ? "bg-gray-100 dark:bg-zinc-700"
                                      : ""
                                  }`}
                                >
                                  <span
                                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(
                                      roleOption.value
                                    )}`}
                                  >
                                    {roleOption.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-2 sm:p-4 text-center">
                      {currentRole === "pilot" ? (
                        <button
                          onClick={() => handleMwstToggle(user.uid, user.mwst || false)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            user.mwst ? "bg-green-600" : "bg-zinc-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              user.mwst ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      ) : (
                        <span className="text-gray-400 dark:text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
