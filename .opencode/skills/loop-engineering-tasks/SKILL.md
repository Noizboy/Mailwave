---
name: loop-engineering-tasks
description: >
  Use when the user asks to create a task checklist, a TODO markdown,
  a follow-up loop engineering document, or an engineering-task tracker .md.
  Covers creating, formatting, and updating incremental engineering task lists
  with stable task IDs, dependencies, files-to-touch, verification commands,
  loop rules, and completion criteria.
---

# Loop Engineering Tasks Skill

## When to use

- The user wants a markdown file to track pending/in-progress/completed engineering tasks.
- The user asks for a "task list", "TODO document", "follow-up loop engineering file", or "engineering task tracker".
- The user wants to plan incremental refactors, fixes, or feature work across multiple loops or sessions.

## When NOT to use

- Do NOT use for standard README, API docs, architecture design docs, or changelogs.
- Do NOT use for simple one-off requests that don’t need a checklist or verification queue.

## File location & naming

Create the file under `docs/` or an equivalent `engineering/` directory at repo root.

Naming conventions:
- `{AREA}_loop_plan.md`
- `{AREA}_follow_up_tasks.md`
- `{AREA}_engineering_queue.md`

Example: `docs/NEXT16_FOLLOW_UP_LOOP_ENGINEERING.md`

## Document template

```markdown
# {Project Area} Loop Engineering Tasks

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task as completed only after verification passes or the remaining risk is documented.

---

## Tasks

### {AREA-001}. {Short descriptive name}

- [ ] **Status:** Pending
- **Priority:** High|Medium|Low
- **Depends on:** None or {Task ID(s)}
- **Files to touch:** {Repo paths or modules}
- **Problem:** {What is broken, slow, missing, or unclear?}
- **Expected outcome:** {Concrete deliverable or decision.}
- **Done when:** {Concrete completion signal.}
- **Verification:**
  ```bash
  # Exact commands to run (tests, lint, build, typecheck, etc.)
  ```
- **Risk / notes:** {Optional — known blockers or things to watch out for.}

### {AREA-002}. ...

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run.
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.
```

## Rules when working from a task file

1. **One task per loop**: Never work on more than one unchecked task at a time.
2. **Smallest safe change**: Prefer a minimal diff that solves the problem over a large refactor.
3. **Verification before check**: Do not mark a task `[x]` until the verification command exits successfully. If it fails, document the failure and create a follow-up task.
4. **Commit per task**: If files are modified, commit them before marking the task complete.
5. **Update the document immediately**: After verification, update the markdown file in the *same loop*. Don’t defer documentation to later.
6. **Keep it local**: Store the file in the repo so it is version-controlled and visible to the whole team.
7. **Keep IDs stable**: Do not rename task IDs once published; append follow-up tasks instead.

## How to use during a working session

1. **Read** the task file if it exists; if it doesn’t, create it from the template above.
2. **Select** the first unchecked task.
3. **Define** the expected outcome in the task description if it’s still vague.
4. **Implement** the smallest safe change.
5. **Verify** by running the listed commands (or equivalent local commands).
6. **Update** the checkbox and add any risk notes.
7. **Commit** the code changes *and* the task-file update together.
8. **Repeat** from step 2.

## Linking follow-up tasks

If a task reveals more work after verification, append a new task at the bottom rather than expanding the current one. Preserve atomicity: each task should solve one bounded problem.
