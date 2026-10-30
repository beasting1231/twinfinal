export function canManageApiKeys(user: { email: string | null; emailVerified: boolean } | null | undefined): boolean {
  return user?.emailVerified === true && user.email?.toLowerCase() === 'pccbasting@gmail.com';
}
