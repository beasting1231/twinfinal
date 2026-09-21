export const DAILY_PLAN_PREVIEW_PATH = "/dailyplan-new";

// UI rollout only; existing Firebase permissions remain authoritative for data.
export function canUseDailyPlanPreview(user: { email: string | null; emailVerified: boolean } | null | undefined): boolean {
  return user?.emailVerified === true && user.email?.toLowerCase() === "pccbasting@gmail.com";
}
