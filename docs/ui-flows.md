> Split from CLAUDE.md — Section 9: UI FLOWS — KEY JOURNEYS

## 9. UI FLOWS — KEY JOURNEYS

### 9.1 Start-of-Day Flow
1. Open Cairn.
2. Dashboard shows "No session logged today" banner.
3. Click "Log Session Bias."
4. Fill bias, key levels, plan. Save.
5. Session active. Dashboard updates.

### 9.2 Trade Flow (Happy Path)
1. Click "New Trade."
2. Fill pair, setup, prices, invalidation, emotional state.
3. Rule panel shows all green.
4. Click "Ready to Trade."
5. Confirm "Order placed in broker." Session locks.
6. Later, click trade → "Close Trade."
7. Fill exit price, reflection.
8. Trade closed. Dashboard updates.

### 9.3 Trade Flow (Rule Block Path)
1. Click "New Trade."
2. User has already taken 2 trades today.
3. `max_trades_per_day` rule blocks immediately on panel open.
4. Rule panel shows red: "Trade limit reached. 2/2 today."
5. Submit button disabled.
6. User can: close panel, or click "Request Override" (if rule allows).
7. Override requires typing OVERRIDE + reason.
8. If overridden, trade proceeds but is pre-flagged dirty.

### 9.4 Post-Loss Tilt Flow
1. User closes a losing trade.
2. Cooldown created (30 min default).
3. Dashboard shows banner: "Cooldown active. New trades blocked for 28:42."
4. If user tries "New Trade": modal blocks with countdown.
5. After cooldown expires, banner clears.
6. If user hits consecutive loss threshold: longer lock, requires typed acknowledgment.

### 9.5 Weekly Review Flow (v1 optional)
1. Sunday: dashboard shows "Weekly Review pending" card.
2. User clicks → Review form opens.
3. Fill top 3 mistakes, best trade, worst trade, lesson, rule focus.
4. Save. Review stored.
5. Next week's rule focus surfaces on dashboard as reminder.

### 9.6 New Account Flow
1. Accounts page → "New Account."
2. Choose template or custom.
3. Fill fields.
4. Review rules (all defaults inherited, user can edit now).
5. Save. Account becomes active account.

### 9.7 Backup Flow
- Automatic: daily at configured time, also on app close if enabled.
- Manual: Settings → Backups → "Backup Now" → confirm destination.
- Restore: Settings → Backups → "Restore from Backup" → pick zip → confirm (destructive modal) → app restarts.

### 9.8 First Launch
See §7.1.

### 9.9 Migration-Failed State
- On migration failure: app shows "Migration failed" screen.
- Offers: "Restore pre-migration snapshot" (recommended), "Try again", "View error log", "Contact (copy error)".
- No normal UI accessible until resolved.
