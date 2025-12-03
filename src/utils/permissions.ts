import type { UserRole } from "../types";

export interface Permissions {
  // Availability management
  canManageOwnAvailability: boolean;
  canManageAllAvailability: boolean;

  // Booking management
  canViewAllBookings: boolean;
  canCreateBookings: boolean;
  canEditOwnBookings: boolean;
  canEditAllBookings: boolean;
  canDeleteOwnBookings: boolean;
  canDeleteAllBookings: boolean;

  // Booking requests
  canManageBookingRequests: boolean;

  // Drivers and sources
  canManageDriversAndSources: boolean;

  // Accounting
  canAccessAccounting: boolean;

  // User management
  canManageRoles: boolean;
  canEditAllUsers: boolean;

  // Notification settings
  canManageNotifications: boolean;
}

/**
 * Get permissions based on user role
 */
export function getPermissions(role: UserRole): Permissions {
  // Users with no role (null) have no permissions
  if (!role) {
    return {
      canManageOwnAvailability: false,
      canManageAllAvailability: false,
      canViewAllBookings: false,
      canCreateBookings: false,
      canEditOwnBookings: false,
      canEditAllBookings: false,
      canDeleteOwnBookings: false,
      canDeleteAllBookings: false,
      canManageBookingRequests: false,
      canManageDriversAndSources: false,
      canAccessAccounting: false,
      canManageRoles: false,
      canEditAllUsers: false,
      canManageNotifications: false,
    };
  }

  switch (role) {
    case "pilot":
      return {
        canManageOwnAvailability: true,
        canManageAllAvailability: false,
        canViewAllBookings: true,
        canCreateBookings: true,
        canEditOwnBookings: true,
        canEditAllBookings: false,
        canDeleteOwnBookings: true,
        canDeleteAllBookings: false,
        canManageBookingRequests: false,
        canManageDriversAndSources: false,
        canAccessAccounting: true,
        canManageRoles: false,
        canEditAllUsers: false,
        canManageNotifications: false,
      };

    case "agency":
      return {
        canManageOwnAvailability: false,
        canManageAllAvailability: false,
        canViewAllBookings: true,
        canCreateBookings: true,
        canEditOwnBookings: true,
        canEditAllBookings: false,
        canDeleteOwnBookings: true,
        canDeleteAllBookings: false,
        canManageBookingRequests: false,
        canManageDriversAndSources: false,
        canAccessAccounting: false,
        canManageRoles: false,
        canEditAllUsers: false,
        canManageNotifications: false,
      };

    case "driver":
      return {
        canManageOwnAvailability: false,
        canManageAllAvailability: false,
        canViewAllBookings: true,
        canCreateBookings: true,
        canEditOwnBookings: true,
        canEditAllBookings: true,
        canDeleteOwnBookings: true,
        canDeleteAllBookings: false,
        canManageBookingRequests: false,
        canManageDriversAndSources: false,
        canAccessAccounting: false,
        canManageRoles: false,
        canEditAllUsers: false,
        canManageNotifications: false,
      };

    case "admin":
      return {
        canManageOwnAvailability: true,
        canManageAllAvailability: true,
        canViewAllBookings: true,
        canCreateBookings: true,
        canEditOwnBookings: true,
        canEditAllBookings: true,
        canDeleteOwnBookings: true,
        canDeleteAllBookings: true,
        canManageBookingRequests: true,
        canManageDriversAndSources: true,
        canAccessAccounting: true,
        canManageRoles: true,
        canEditAllUsers: true,
        canManageNotifications: true,
      };

    default:
      // Fallback for unknown roles
      return getPermissions(null);
  }
}

/**
 * Check if user can edit a specific booking
 */
export function canEditBooking(
  role: UserRole,
  userId: string,
  bookingCreatorId?: string
): boolean {
  const permissions = getPermissions(role);

  if (permissions.canEditAllBookings) {
    return true;
  }

  if (permissions.canEditOwnBookings && bookingCreatorId === userId) {
    return true;
  }

  return false;
}

/**
 * Check if user can delete a specific booking
 */
export function canDeleteBooking(
  role: UserRole,
  userId: string,
  bookingCreatorId?: string
): boolean {
  const permissions = getPermissions(role);

  if (permissions.canDeleteAllBookings) {
    return true;
  }

  if (permissions.canDeleteOwnBookings && bookingCreatorId === userId) {
    return true;
  }

  return false;
}
