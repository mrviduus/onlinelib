# PDD: Update README.md with Actual Info

## Status
In Progress

## Goal
Update the README.md to reflect the current state of the project, ensuring all information is accurate and up-to-date based on CLAUDE.md.

## Non-goals
- Adding new sections not already in README
- Changing the overall structure/layout
- Adding screenshots or new assets

## Plan

### Slice 1: Update Tech Stack & Prerequisites ✅
- [x] Update .NET version to 10 (currently missing explicit version mention in some places)
- [x] Verify pnpm is mentioned as package manager
- [x] Ensure all tech stack items match CLAUDE.md
- [x] Add Prerequisites line below Tech Stack table

### Slice 2: Update Commands Section
- [ ] Add missing commands from CLAUDE.md (migrations, mobile commands)
- [ ] Ensure all existing commands are accurate

### Slice 3: Update Features & Key Concepts
- [ ] Verify feature list matches current capabilities
- [ ] Add any missing features from CLAUDE.md

### Slice 4: Final Review & Verification
- [ ] Cross-check all sections against CLAUDE.md
- [ ] Ensure URLs and service ports are accurate
- [ ] Verify deployment info is current

## Files to Change
- `README.md`

## Verification
- Compare README.md sections against CLAUDE.md
- Ensure no broken links or outdated information
