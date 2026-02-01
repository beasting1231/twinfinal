# Code Splitting Implementation Gameplan

**Created:** 2026-01-31
**Status:** 🟡 In Progress
**Current Phase:** Phase 1 - Settings Page Split

---

## 🎯 Goal

Reduce initial bundle size from **2.12 MB** to **~800 KB** (60% reduction) by splitting routes into separate chunks that load on-demand.

**Key Principle:** Start small, test thoroughly, expand incrementally. **NEVER BREAK THE APP.**

---

## 📊 Current State

- **Main Bundle:** 2,119 KB (uncompressed), 637 KB (gzipped)
- **CSS:** 128 KB (uncompressed), 24.5 KB (gzipped)
- **Routes:** All routes in main bundle (no code splitting)

---

## 🎯 Target State

- **Main Bundle:** ~800 KB (critical routes only)
- **Settings Chunk:** ~120 KB (lazy loaded)
- **Admin Chunk:** ~200 KB (lazy loaded)
- **Reports Chunk:** ~150 KB (lazy loaded)
- **Accounting Chunk:** ~180 KB (lazy loaded)
- **Forms Chunk:** ~100 KB (lazy loaded)

**Total Savings:** ~1.3 MB not loaded initially

---

## 🛡️ Safety-First Approach

### What We'll Split (Safe)
- ✅ Settings page (rarely accessed)
- ✅ Admin reports (admin-only)
- ✅ User management (admin-only)
- ✅ Accounting (specific users)
- ✅ Forms page (occasional use)
- ✅ Gift Vouchers (occasional use)
- ✅ Email management (admin-only)

### What We'll NEVER Split (Keep in Main Bundle)
- ❌ Daily grid (most accessed page)
- ❌ Login/Auth components
- ❌ Header/Navigation
- ❌ ProtectedRoute
- ❌ Core contexts (Auth, Theme, Editing)
- ❌ Common components (modals, buttons)

---

## 📋 Implementation Phases

### Phase 1: Proof of Concept - Settings Page ✅
**Status:** ✅ Complete
**Risk Level:** ⭐ Very Low
**Time Estimate:** 30-45 minutes

#### Checklist
- [x] Create error boundary component
- [x] Create retry import utility
- [x] Add lazy loading for Settings route (NotificationSettings)
- [x] Add Suspense fallback
- [x] Add error handling
- [x] Build for production
- [ ] Test in development
- [ ] Test with slow 3G
- [ ] Test with offline/online toggle
- [ ] Test navigation to/from Settings
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] **DECISION POINT:** Continue to Phase 2?

**Actual Outcome:**
- NotificationSettings chunk: 8.88 kB (2.29 kB gzipped) ✅
- Build successful, no errors ✅

---

### Phase 2: Admin Routes ✅
**Status:** ✅ Complete
**Risk Level:** ⭐ Very Low
**Time Estimate:** 20 minutes

#### Checklist
- [x] Add lazy loading for UserManagement
- [x] Add lazy loading for Email
- [x] Add ErrorBoundary and Suspense wrappers
- [x] Build for production
- [ ] Test admin routes in development
- [ ] Test with slow 3G
- [ ] Test navigation to/from admin pages
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] **DECISION POINT:** Continue to Phase 3?

**Actual Outcome:**
- UserManagement chunk: 8.38 kB (2.86 kB gzipped) ✅
- Email chunk: 84.33 kB (21.10 kB gzipped) ✅
- Main bundle: 2,119 KB → 2,023 KB (96 KB savings) ✅
- Build successful, no errors ✅

---

### Phase 3: Reports & Accounting (If Phase 2 Succeeds) ⏸️
**Status:** ⏸️ Pending Phase 2 Approval
**Risk Level:** ⭐⭐ Low
**Time Estimate:** 30 minutes

#### Checklist
- [ ] Add lazy loading for Accounting
- [ ] Add lazy loading for BookingSources
- [ ] Add lazy loading for Priority
- [ ] Test accounting features
- [ ] Build and deploy
- [ ] Monitor for 24 hours
- [ ] **DECISION POINT:** Continue to Phase 4?

**Expected Outcome:**
- Main bundle: ~1,600 KB → ~1,200 KB
- Accounting chunk: ~180 KB (loads on-demand)
- Reports chunk: ~150 KB (loads on-demand)

---

### Phase 4: Forms & Extras (If Phase 3 Succeeds) ⏸️
**Status:** ⏸️ Pending Phase 3 Approval
**Risk Level:** ⭐⭐ Low
**Time Estimate:** 20 minutes

#### Checklist
- [ ] Add lazy loading for Forms
- [ ] Add lazy loading for GiftVouchers
- [ ] Add lazy loading for GiftVoucherForm
- [ ] Add lazy loading for NotificationSettings
- [ ] Test all features
- [ ] Build and deploy
- [ ] Monitor for 24 hours
- [ ] **COMPLETE!**

**Expected Outcome:**
- Main bundle: ~1,200 KB → ~800 KB
- Forms chunk: ~100 KB (loads on-demand)
- Gift Vouchers chunk: ~80 KB (loads on-demand)

---

## 🔧 Technical Implementation

### 1. Error Boundary Component
**File:** `src/components/ErrorBoundary.tsx`

**Purpose:** Catch errors during lazy loading and show user-friendly fallback

**Features:**
- Catches component errors
- Shows error message
- Provides retry button
- Logs errors to console

**Status:** [x] ✅ Complete

---

### 2. Retry Import Utility
**File:** `src/utils/retryImport.ts`

**Purpose:** Retry failed chunk loads (network glitches)

**Features:**
- Retry up to 3 times
- 1-second delay between retries
- Exponential backoff (1.5x)
- Clear error messages

**Status:** [x] ✅ Complete

---

### 3. Lazy Route Configuration
**File:** `src/App.tsx`

**Changes:**
```typescript
// Before
import { NotificationSettings } from "./components/NotificationSettings";

// After
const NotificationSettings = lazy(() =>
  retryImport(() =>
    import("./components/NotificationSettings").then((module) => ({
      default: module.NotificationSettings,
    }))
  )
);
```

**Status:** [x] ✅ Complete

---

### 4. Suspense Wrapper
**Implementation:**
```typescript
<ErrorBoundary>
  <Suspense fallback={<LoadingScreen />}>
    <NotificationSettings />
  </Suspense>
</ErrorBoundary>
```

**Status:** [x] ✅ Complete

---

## 🧪 Testing Checklist

### Pre-Deployment Testing (Required for Each Phase)

#### Functional Tests
- [ ] Route navigation works
- [ ] Back/forward buttons work
- [ ] Direct URL access works
- [ ] Lazy routes load successfully
- [ ] Error boundary catches errors
- [ ] Retry logic works on failure

#### Performance Tests
- [ ] Bundle size reduced
- [ ] Chunk loads quickly
- [ ] No duplicate code in chunks
- [ ] Gzip compression working

#### Network Condition Tests
- [ ] Works on fast connection
- [ ] Works on slow 3G
- [ ] Works with network toggle (online/offline)
- [ ] Retry works on temporary failure
- [ ] Graceful degradation on permanent failure

#### Browser Tests
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)
- [ ] Firefox (optional)

#### Cache Tests
- [ ] Works with empty cache
- [ ] Works with warm cache
- [ ] Hard reload works (Cmd+Shift+R)
- [ ] Service worker compatibility

---

## 📊 Success Metrics

### Phase 1 Success Criteria
- ✅ Main bundle reduced by at least 100 KB
- ✅ Settings page loads in < 1 second
- ✅ Zero console errors
- ✅ Zero user complaints for 24 hours

### Overall Success Criteria (All Phases)
- ✅ Main bundle reduced to ~800 KB (60% reduction)
- ✅ Initial page load faster
- ✅ All routes load successfully
- ✅ Zero errors in production
- ✅ User experience unchanged or better

---

## 🚨 Rollback Plan

### If Phase 1 Has Issues
```bash
# Immediate rollback (< 1 minute)
git revert <phase-1-commit>
npm run build
firebase deploy --only hosting
```

### If Later Phase Has Issues
```bash
# Revert only the problematic phase
git revert <phase-X-commit>
npm run build
firebase deploy --only hosting
```

### Nuclear Option (Revert Everything)
```bash
# Revert all code splitting changes
git revert <first-commit>..<last-commit>
npm run build
firebase deploy --only hosting
```

---

## 📈 Progress Tracking

### Overall Progress
- [x] Phase 1: Settings (100%) ✅
- [x] Phase 2: Admin Routes (100%) ✅
- [ ] Phase 3: Reports & Accounting (0%)
- [ ] Phase 4: Forms & Extras (0%)

**Overall Completion:** 50% (2/4 phases complete, awaiting testing)

---

## 🐛 Known Issues / Gotchas

### Issue 1: Chunk Loading Failures
**Symptom:** User sees error when navigating to lazy route
**Cause:** Network failure, CDN issue, or cache problem
**Solution:** Retry logic (implemented in retryImport)
**Status:** Prevented by retry utility

### Issue 2: Circular Dependencies
**Symptom:** Build fails or chunks are huge
**Cause:** Components importing each other
**Solution:** Review imports, use dynamic imports carefully
**Status:** Will monitor during build

### Issue 3: CSS Not Loaded
**Symptom:** Lazy route has no styles
**Cause:** CSS not included in chunk
**Solution:** Ensure CSS imports in lazy component
**Status:** Will verify during testing

### Issue 4: Service Worker Cache
**Symptom:** Old chunks served after update
**Cause:** Service worker caching strategy
**Solution:** Update service worker cache keys
**Status:** Will verify after deployment

---

## 📝 Commit Strategy

Each phase will be a separate commit for easy rollback:

```
Phase 1: feat: add code splitting for Settings page
Phase 2: feat: add code splitting for admin routes
Phase 3: feat: add code splitting for reports & accounting
Phase 4: feat: add code splitting for forms & extras
```

**Benefit:** Can revert individual phases without affecting others.

---

## 🎓 Lessons Learned (To Be Updated)

### What Worked Well
- (Will update after each phase)

### What Didn't Work
- (Will update if issues arise)

### Optimizations Discovered
- (Will update with findings)

---

## 📞 Support & Resources

### If Something Goes Wrong
1. Check browser console for errors
2. Check Network tab for failed chunk loads
3. Check this gameplan for rollback instructions
4. Revert the phase commit
5. Deploy immediately

### Useful Commands
```bash
# Check bundle sizes
npm run build
ls -lh dist/assets/

# Analyze bundle
npm run build -- --mode analyze

# Test locally
npm run dev

# Deploy
npm run build && firebase deploy --only hosting
```

---

## ✅ Sign-Off

### Phase 1 Approval
- [ ] Development tested
- [ ] Production deployed
- [ ] Monitored for 24 hours
- [ ] No issues reported
- [ ] **Approved by:** _____________
- [ ] **Date:** _____________

### Phase 2 Approval
- [ ] Development tested
- [ ] Production deployed
- [ ] Monitored for 24 hours
- [ ] No issues reported
- [ ] **Approved by:** _____________
- [ ] **Date:** _____________

### Phase 3 Approval
- [ ] Development tested
- [ ] Production deployed
- [ ] Monitored for 24 hours
- [ ] No issues reported
- [ ] **Approved by:** _____________
- [ ] **Date:** _____________

### Phase 4 Approval
- [ ] Development tested
- [ ] Production deployed
- [ ] Monitored for 24 hours
- [ ] No issues reported
- [ ] **Approved by:** _____________
- [ ] **Date:** _____________

---

**Last Updated:** 2026-01-31 (Created)
**Status:** Ready to begin Phase 1
