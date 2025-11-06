import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile, UserRole } from "../types";

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedRoles, setEditedRoles] = useState<Record<string, UserRole>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

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

  const hasChanges = Object.keys(editedRoles).length > 0;

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
        <div className="text-zinc-400">Loading users...</div>
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
    <div className="flex-1 overflow-auto p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-white">User Management</h1>
          {hasChanges && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-2 sm:p-4 text-zinc-400 font-medium w-[25%] sm:w-[30%]">Name</th>
                <th className="text-left p-2 sm:p-4 text-zinc-400 font-medium w-[40%] sm:w-[35%]">Email</th>
                <th className="text-left p-2 sm:p-4 text-zinc-400 font-medium w-[35%] sm:w-[35%]">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const currentRole = getCurrentRole(user);
                const isOpen = openDropdownId === user.uid;

                return (
                  <tr
                    key={user.uid}
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="p-2 sm:p-4 text-white truncate">{user.displayName}</td>
                    <td className="p-2 sm:p-4 text-zinc-400 truncate" title={user.email}>{user.email}</td>
                    <td className="p-2 sm:p-4">
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
                            <div className="absolute z-20 mt-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg min-w-[160px]">
                              {roles.map((roleOption) => (
                                <button
                                  key={roleOption.label}
                                  onClick={() =>
                                    handleRoleChange(user.uid, roleOption.value)
                                  }
                                  className={`w-full text-left px-4 py-2 hover:bg-zinc-700 transition-colors ${
                                    currentRole === roleOption.value
                                      ? "bg-zinc-700"
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
