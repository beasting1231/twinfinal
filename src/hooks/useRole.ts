import { useAuth } from "../contexts/AuthContext";
import { getPermissions, canEditBooking, canDeleteBooking } from "../utils/permissions";
import type { Permissions } from "../utils/permissions";

/**
 * Hook to check user role and permissions
 */
export function useRole() {
  const { currentUser, userRole } = useAuth();

  const permissions: Permissions = getPermissions(userRole);

  return {
    role: userRole,
    permissions,
    canEditBooking: (bookingCreatorId?: string) =>
      canEditBooking(userRole, currentUser?.uid || "", bookingCreatorId),
    canDeleteBooking: (bookingCreatorId?: string) =>
      canDeleteBooking(userRole, currentUser?.uid || "", bookingCreatorId),
  };
}
