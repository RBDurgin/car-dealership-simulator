# Phase 3 Plan — Employees & NPCs

**Status:** Planned 2026-10-04, approved for implementation in a new session. First step: point `CLAUDE.md` at this plan and start 3a. We do one sub-phase per session and stop for Robert's review after each, the same as Phases 1 and 2.

## Context

At the end of Phase 2 the player is the only salesperson. Customers arrive, browse and wait. The player greets them, makes an MSRP offer and signs the paperwork at the office desk, and the day ends with a summary. The spec's Phase 3 is "introduce other employees and NPCs". The goal is a dealership that feels staffed and alive, where hiring well lets the player sell more than they could alone. Wages also give cash its first expense.

**Decisions made with Robert:**

- **Roles:** all four are in.
  - **AI salesperson:** sells on their own with the same greet → offer → desk loop and earns a commission.
  - **Receptionist:** waiting customers lose patience more slowly, and they announce new arrivals.
  - **Finance manager:** takes over the paperwork so the player can get back to the floor.
  - **Lot porter:** washes cars, and clean cars sell slightly better.
- **Hiring:** hire and fire from a candidate list. Daily wages and commissions are paid at the end of the day and shown in the day summary.
- **NPCs:** sidewalk pedestrians (a few wander in and become customers), customer archetypes (tire-kickers, decisive buyers, couples), and an owner who visits with a daily goal.
- **Collisions:** light avoidance, with tile reservation and local separation. It is not a crowd sim.

## Architecture additions

```
src/sim/
  staff.ts          # Role, Employee {id,name,variant,role,wage,skill}, candidate generator, payroll
  staffAi.ts        # pure per-role decision functions: what an employee should do next given world state
  crowd.ts          # occupancy map + separation steering (pure, tested)
  cleanliness.ts    # car dirt decay / wash, accept-chance bonus
  pedestrians.ts    # ambient walker schedule, walk-in chance
  archetypes.ts     # customer archetype table + modifiers
  owner.ts          # daily goal generator + evaluation against DayStats
src/scene/
  Staff.tsx         # one useFrame drives all employee walkers (mirrors Customers.tsx)
  Pedestrians.tsx   # ambient walkers (no store state at all)
  Owner.tsx         # owner walker on visit days
  walker.ts         # shared Walker core extracted from Customers.tsx (pos, heading, anim, waypoints, substepped move)
src/ui/
  StaffPanel.tsx    # roster + candidates, hire/fire (opened from TopBar button / key)
  GoalBanner.tsx    # today's owner goal + progress
```

Rules carried over: positions stay in walkers and `runtime.ts` maps (`staffPos`, alongside `customerPos`). The store only holds discrete events: roster changes, employee task changes, customer phases and money. All new logic in `src/sim/` is pure and covered by Vitest.

**Key refactor:** `Customer.handlerId: 'player' | employeeId | null`. Today `dealCustomer` assumes a single deal. It becomes `dealCustomer(customers, handlerId)`, so the player and each AI salesperson can each have one deal in progress. Customer events gain an optional `by` (the handler), and `actionBlocker` refuses to let the player greet a customer someone else is handling.

## Sub-phases

### 3a — Staff foundation & hiring (+ receptionist)

- Extract the shared walker core from `scene/Customers.tsx` into `scene/walker.ts`: `Walker` fields, substepped `stepAlongPath` loop, heading damping, anim selection, seat/stand. Customer behaviour must not change.
- `sim/staff.ts`:
  - `Role = 'sales' | 'receptionist' | 'finance' | 'porter'`.
  - `generateCandidates(rng, day)` gives 3–5 candidates per day, each with a name, variant, role, `skill` 1–5 and a daily wage that scales with skill.
  - Commission rate for sales staff.
  - `payroll(roster, stats)` returns wages plus commissions.
  - Limits: 1 receptionist, 1 finance manager, 2 sales staff, 1 porter.
- Store:
  - `roster: Employee[]`, `candidates`, `hire(id)`, `fire(id)`.
  - Payroll is deducted in `startNextDay`, or when the summary is shown, and recorded in `dayStats.expenses`.
  - Firing takes effect at the end of the day, or immediately if the employee is idle.
- Character variants: add the unused Kenney Mini Characters (check the pack for spare `male-*` / `female-*` variants). Staff also get a small role badge (drei `<Html>`, like `CustomerBubble`) and a staff shirt tint, so they read as employees.
- `scene/Staff.tsx`:
  - Employees spawn at the sidewalk at opening and walk to their post: the receptionist to `reception-desk`, which needs a chair added to `layout.ts`.
  - They idle at the post and leave at closing.
  - Employees are hoverable, and Inspect shows role, skill and wage.
- **Receptionist effect:** while the receptionist is seated, the `tick` patience drain is multiplied by 0.5. They also send a notice ("Alex B. is waiting by the SUV") when a customer starts waiting.
- UI:
  - `StaffPanel`, opened with a TopBar "Staff" button.
  - `DaySummary` gains Wages, Commissions and Net lines.
- **Done when:**
  - You can hire a receptionist, who walks in, sits at reception and leaves at close.
  - Patience visibly lasts longer while the receptionist is on shift.
  - Payroll comes out of cash at the end of the day.
  - Tests, lint and build are clean.

### 3b — Light avoidance

- `sim/crowd.ts`:
  - An occupancy map of the tile each agent stands on.
  - `pathCost` lets A* (`sim/pathfinding.ts`) treat occupied tiles as costly but passable, so nobody gets hard-stuck.
  - `separation(pos, neighbours)` returns a small push vector, applied in `stepAlongPath` callers and clamped by `moveWithCollision`.
- Goal tiles: browsing customers pick a free approach tile first. The guest chair and posts are reserved.
- The player takes part: the player pushes NPCs, but NPCs don't push the player.
- **Done when:** customers spread around a car instead of stacking, and staff and customers sidestep each other in doorways. Nobody gets stuck in a ×16 day (check headless with 10+ agents).

### 3c — Handlers & finance manager

- Add `handlerId` to `Customer`, make `deal.ts` per-handler and update the store and tests. With no staff, behaviour is unchanged.
- Finance manager:
  - Their post is the office desk chair.
  - When they're on shift, **Close deal** becomes **Hand off to finance**. The player leads the buyer to the office, the customer sits in the guest chair, and the FM does the paperwork. It takes 6s, scaled by skill.
  - The player is free as soon as the customer sits.
  - The FM earns a flat fee per deal, added to commissions.
  - If the FM is busy, the next buyer waits in the lounge (sofa seat) without losing patience. If the FM is off shift, the player signs at the desk as before.
- **Done when:** with an FM hired, the player can hand off a buyer and greet the next customer while the sale completes. Signing is credited correctly and the day summary attributes it.

### 3d — AI salesperson

- `sim/staffAi.ts`: `nextSalesTask(employee, customers, inventory)` picks the waiting or browsing customer with the least patience left that nobody is handling. It returns `greet | offer | lead | sign | idle`.
- Durations and accept chance:
  - Durations are scaled by skill.
  - `acceptChance` takes a `skillBonus`: −10% at skill 1 up to +5% at skill 5. The player counts as skill 4.
- The salesperson walks to the customer, stands talking for the greet time (the customer faces them) and makes the MSRP offer.
- If the customer accepts, the salesperson leads them to a **sales desk**: add one or two desk, chair and guest-chair sets to the showroom in `layout.ts`. If an FM is on shift and free, the salesperson hands off to them; otherwise they sign at their own desk.
- Commission is a share of the price, for example 3%. Each sale records `soldBy`, and `DaySummary` shows a per-seller breakdown.
- Collision with the player: the player can't greet a customer who is being handled by staff (the bubble shows a staff badge). An AI never takes a customer the player is heading to: it checks `activeAction.targetId`.
- **Done when:** with two salespeople hired and the player idle, a ×16 day sells cars on its own, commissions are paid, and nobody deadlocks over a customer or a desk.
- **Built (2026-10-04):**
  - Customers are claimed (`claim` event) before a salesperson walks over, so two staff never chase one customer. Claimed customers stop and lose no patience.
  - Two sales desks, one per salesperson in hiring order (`salesDeskOf`): by the entrance (x21–22, z9–11) and by the office door (x26–27, z3–5). Salespeople sit at their desk between customers.
  - A buyer goes to finance if finance is on duty and free, otherwise to the salesperson's own desk (`leadChoice`). The customer's `sellerId` keeps the sale credited through a hand-off. Commission is 3% of the price, plus the finance fee when finance signs.
  - Salespeople also greet customers who are still browsing (a waiting customer always comes first). Skill 4–5 salespeople meet them as they arrive; skill 1–3 wait until the customer is standing at a car (`EARLY_GREET_SKILL`, `runtime.customersAtCar`).

### 3e — Lot porter & car cleanliness

- `sim/cleanliness.ts`: `InventoryCar.cleanliness` runs from 0 to 1.
  - It drops a little each day, and each browse visit adds a little dirt.
  - `acceptChance` gets up to +8% for a clean car and −8% for a dirty one.
- The porter's AI loop walks to the dirtiest car, plays a timed wash with an `interact` clip and sets the car back to 1. The player can also **Wash car** from the car menu.
- Visuals: a dirty car's paint material gets a darkened, rougher tint, lerped by cleanliness. `InfoPanel` shows "Clean / Dusty / Dirty".
- **Done when:** cars visibly get dusty over a couple of days, and the porter keeps them clean. The accept-chance bonus is covered by tests.

### 3f — NPCs: pedestrians, archetypes, owner

- **Pedestrians:**
  - A pure schedule (`sim/pedestrians.ts`) sends ambient walkers from one end of the sidewalk to the other, with no store state.
  - About 15% wander in: they become a customer by being added to the store at the lot entry, through a store action that counts them as a visitor.
  - The spawner's planned arrivals drop a little to compensate.
- **Archetypes** (`sim/archetypes.ts`), each with modifiers applied in `generateCustomer`:
  - `tire-kicker` browses a lot and has a very low accept chance.
  - `decisive` browses one car, has short patience and a high accept chance.
  - `bargain` has a tight budget.
  - `couple` is a lead customer plus a companion walker who follows them and has no state of their own.
  - `CustomerPanel` hints at the archetype after the greet ("Just looking", "Knows what they want").
- **Owner:**
  - Visits every two to three days at opening (a fixed variant with a suit tint), walks to the office and sets a goal (`sim/owner.ts`). Example goals: "Sell 2 cars", "Sell an SUV", "No impatient walk-outs", "$80k revenue".
  - `GoalBanner` shows the goal and progress. The goal is judged against `DayStats` at closing: a cash bonus if it's met, a grumpy line in the summary if it isn't.
- **Done when:** the sidewalk has passers-by and some walk in. Archetypes behave differently in a ×16 day, and an owner day shows the goal, tracks progress and pays or scolds in the summary.

## Files touched (representative)

- New:
  - `src/sim/{staff,staffAi,crowd,cleanliness,pedestrians,archetypes,owner}.ts` + tests
  - `src/scene/{walker.ts,Staff,Pedestrians,Owner}.tsx`
  - `src/ui/{StaffPanel,GoalBanner}.tsx`
  - `docs/PHASE3_PLAN.md`
- Modified:
  - `src/sim/{customers,deal,agent,pathfinding,inventory,layout,interactables,characters}.ts`
  - `src/state/store.ts`
  - `src/scene/{Customers,runtime,Props,CustomerBubble}.tsx`
  - `src/ui/{DaySummary,TopBar,CustomerPanel,InfoPanel,ControlsHint}.tsx`
  - `public/models/LICENSE.md`, `CLAUDE.md`
- Reuse:
  - `stepAlongPath`, `toWaypoints`, `dampAngle`, `headingTo` (`sim/agent.ts`)
  - `findPathToAny`, `approachTilesFor`, `interactableCenter`
  - `reduceCustomers` + `commit()`, `actionBlocker`
  - `createRng` / `hashSeed`, `planArrivals` / `takeDue`, the notice toast, the `<Character>` anim ref, the `CustomerBubble` `<Html>` pattern

## Verification (each sub-phase)

- `npm test`, `npm run lint` and `npm run build` are all clean. Every new `sim/` module has Vitest coverage: decisions, payroll, goals, occupancy and stale events.
- Manual play in `npm run dev` against the sub-phase's "Done when". Headless Playwright checks follow the Phase 2 approach (swiftshader, driving the store via `window.game`), using ×16 days for the AI and NPC phases.
- The how-to-play guide (`ui/HowToPlay.tsx`) and the controls list (`ui/controls.ts`) describe what the sub-phase adds: the finance manager in 3c, the salesperson and commissions in 3d, the porter and washing cars in 3e.
- Robert reviews and approves each sub-phase before the next one starts.

## Out of scope / notes

- **Balance:** wages will look tiny next to revenue until Phase 4 makes cars cost money to buy. Retune wages and commissions then.
- Out of scope for Phase 3: negotiation (Phase 5, though the AI's `offer` should go through one function so it can take over), marketing (Phase 6), audio and gibberish talk (Phase 7), and save/load.
