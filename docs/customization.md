> Split from CLAUDE.md — Section 10: CUSTOMIZATION

## 10. CUSTOMIZATION

Everything that could reasonably vary per user or per account must be customizable without code changes.

### 10.1 What's Customizable

**Global:**
- Pairs (add, edit, archive)
- Setups (add, edit, archive)
- Killzones (times, names)
- Prop firms
- Account templates
- Theme, timezone, formatting

**Per account:**
- Every rule (enable, config value)
- Account-specific rule overrides
- Display name

**Per session:**
- Bias fields
- Key levels

### 10.2 Adding a Custom Pair

Form:
- Symbol (unique, uppercase, no spaces)
- Display name
- Asset class
- Pip decimal (how many decimals = 1 pip)
- Pip value per standard lot ($ per pip at 1.0 lot)
- Correlated symbols (for SMT)

### 10.3 Adding a Custom Setup

- Name, category, description, display color, active flag.

### 10.4 Adding a Custom Rule (v2)

Built-in rules are the initial set. v2 will allow user-defined simple rules via a rule builder (e.g., "Block if I'm trading on a Friday afternoon"). Out of scope for v1.

### 10.5 Account Template Customization

All fields in §5.2.3 are user-editable. Templates can be exported/imported as JSON.
