---
title: "Core Composition"
path: "core-composition"
summary: "How packages/core is wired: the type-checked DI registry, the compose() lifecycle, three-level module assembly, the command pattern, and the logging and transaction machinery shared by every service."
---

# Core Composition

This is the deep dive behind decisions 1, 2, and 5 in
[ARCHITECTURE](./ARCHITECTURE.md). It covers how `packages/core` is assembled:
the dependency-injection registry, the `compose()` lifecycle, how modules nest
into the core graph, and the shared machinery — commands, logging, transactions —
that every service is built on.

If you only read one thing: nothing in core constructs its own dependencies.
Services declare what they need as a constructor parameter, the registry knows
how to build each named thing, and a single `compose()` call instantiates the
whole graph in order. The novel part is that the wiring is checked by the
TypeScript compiler — an incorrectly wired graph does not build.

## The Registry

The registry lives in `packages/core/src/lib/registry.ts`. There are two
classes, `Registry` (synchronous) and `AsyncRegistry` (allows asynchronous
construction). Both carry two phantom type parameters that drive the
compile-time checking:

```ts
export class Registry<
  TRequires extends Record<Token, unknown> = {},  // deps still needed from outside
  TProvides extends Record<Token, unknown> = {},  // names this registry can supply
> { … }
```

`TProvides` grows every time you add a provider; `TRequires` accumulates any
dependency a provider asked for that hasn't already been provided. A fully
self-contained registry ends with `TRequires` empty; one that still requires
something must be handed that something at `compose()` time (or nested inside a
parent that provides it).

### Provider kinds

You add providers with chained calls, each naming the thing it produces. The
kinds differ only in *how* the value is constructed:

| Method | Constructs by | Available on |
| --- | --- | --- |
| `addValue(name, v)` | using `v` as-is | both |
| `addFactory(name, fn)` | calling `fn(context)` | both |
| `addClass(name, C)` | `new C(context)` | both |
| `addAsyncClass(name, C)` | `await C.create(context)` | `AsyncRegistry` only |
| `addNested(name, reg)` | composing a child `Registry` | both |
| `addNestedAsync(name, reg)` | composing a child `AsyncRegistry` | `AsyncRegistry` only |

Each provider receives the **same `context` object** — the accumulated bag of
everything provided so far — as its single argument. A class therefore declares
its dependencies simply by destructuring named fields from that argument:

```ts
// every service follows this shape
constructor(deps: { logger: CoreLogger; tx: TXManager; queries: AccountQueries }) { … }
```

The registry reads `ConstructorParameters<TClass>[0]` (or `Parameters<TFactory>[0]`,
or `Parameters<TClass['create']>[0]`) to learn what each provider wants, and
checks it against `TProvides`/`TRequires`.

### Compile-time validation

Every `add*` method is constrained by a `ValidateDeps` conditional type. Before
the call type-checks, `ValidateDeps` verifies that:

- the name isn't already provided (no **duplicate provider**),
- the name doesn't collide with an outstanding requirement (no **name conflict
  with a prior requirement**),
- each requested dependency that *is* already provided has a **compatible type**, and
- each requested dependency that *isn't* yet provided is **mergeable** with the
  existing requirements (so two providers can't ask for the same name at
  incompatible types).

When a check fails, `ValidateDeps` resolves to an object describing the problem
(`{ error: 'Duplicate provider name'; name }`, `{ error: 'Dependency type
conflicts with provided type'; … }`, and so on). Because the method's value
parameter is typed `TValidation extends true ? TClass : TValidation`, that error
object becomes the *expected type* of the argument — so the mistake surfaces as a
TypeScript error at the offending `addClass`/`addFactory` line, with the reason
embedded. Misordering providers (using something before it's provided) or wiring
the wrong type together is a compile error, not a runtime one.

### Recovering the provided type

After composition you often want the static type of "everything this registry
produced". `RegisteredServices<T>` extracts the `TProvides` parameter:

```ts
export type RegisteredServices<TRegistry> = TRegistry extends Registry<any, infer TProvided>
  ? TProvided
  : TRegistry extends AsyncRegistry<any, infer TProvided>
    ? Normalize<TProvided>
    : never
```

This is how the `get*Commands` projectors (below) get a fully-typed view of a
composed module registry.

## The compose() Lifecycle

`compose(requirements)` walks the providers **in insertion order**, building two
things as it goes: `result` (what gets returned) and `context` (the same values,
used as the dependency bag for subsequent providers). The synchronous version:

```ts
compose(requirements: TRequires): Normalize<TProvides> {
  const result = {} as any
  const context = { ...requirements } as any

  for (const { type, name, value } of this.providers) {
    if (type === 'value')        context[name] = result[name] = value
    else if (type === 'class')   context[name] = result[name] = new value(context)
    else if (type === 'factory') context[name] = result[name] = value(context)
    else if (type === 'nested')  context[name] = result[name] = value.compose(context)
  }
  return result
}
```

Three consequences worth internalising:

1. **Order matters.** A provider can only see dependencies added *before* it.
   The type system enforces this — using something too early won't compile — but
   it's why `core.ts` adds `logger`, `db`, `config`, and friends before the
   nested module registries.
2. **`requirements` seeds the context.** Anything a registry still `TRequires`
   must be passed into `compose()`. At the top level that's the `pinoLogger`; for
   a nested registry it's the parent's accumulated context (next section).
3. **Singletons by construction.** Each provider runs once, so every consumer of
   `logger`, `db`, or a given service shares one instance for the life of the
   composed graph.

`AsyncRegistry.compose` is the same loop, `await`-ing values, `factory` results,
and `create()` calls so that asynchronous construction (the DB pool, the LTI
keystore) slots into the same ordered pass.

## Three Levels of Composition

The graph is assembled in three nested tiers.

**1 — Core (`packages/core/src/core.ts`).** Provides the cross-cutting
singletons, then nests the three domain registries:

```ts
new AsyncRegistry()
  .addValue('config', config)
  .addFactory('logger', createCoreLogger)
  .addFactory('dbPool', createDBPool)
  .addClass('db', DBManagerImpl)
  .addClass('tx', TXManagerImpl)
  // …mailer, jwt, ltiKeyStore, utils…
  .addNested('app', createAppRegistry())
  .addNested('admin', createAdminRegistry())
  .addNested('agent', createAgentRegistry())
```

**2 — Domain (`modules/{app,admin,agent}/index.ts`).** Each domain registry
nests its modules:

```ts
export const createAppRegistry = () =>
  new Registry()
    .addNested('account', createAccountRegistry())
    .addNested('activities', createActivityRegistry())
    .addNested('session', createSessionRegistry())
    .addNested('registration', createRegistrationRegistry())
    .addNested('lti', createLtiRegistry())
```

**3 — Module.** Each module registry provides its repository, services, and
commands. Note that none of these re-declare `logger`, `db`, `tx`, etc. — those
come from the core context, flowed down through nesting:

```ts
const createAccountRegistry = () =>
  new Registry()
    .addClass('queries', AccountQueries)
    .addClass('mutations', AccountMutations)
    .addClass('service', AccountService)
    .addClass('commands', AccountCommands)
```

Because `addNested` composes the child with the parent's `context`, a module
service can depend on a core-level singleton (`tx`, `mailer`, `logger`) *and* a
sibling within its own module (`queries`, `mutations`) in the same constructor —
and the type checker validates the whole chain. A module that needs something the
core doesn't provide would surface as an unsatisfied `TRequires` at the
`addNested` call site.

## Anatomy of a Module

Every module under `modules/` has the same four parts (see ARCHITECTURE
decision 5). Following the `account` module top to bottom:

**`repository/index.ts` — the only place SQL lives.** Split into `*Queries`
(reads) and `*Mutations` (writes), each extending `BaseService`:

```ts
export class AccountQueries extends BaseService {
  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'app', 'account')
    this.utils = deps.utils
    this.db = deps.db
  }
  // …Drizzle queries against this.db.get()…
}
```

**`services/*.ts` — business logic.** Composes repositories and core services,
throws typed `CoreError`s, and is decorated for tracing:

```ts
export class AccountService extends BaseService {
  constructor(deps: { logger; tx; mailer; queries; mutations }) {
    super(deps.logger, 'app', 'account')
    // …
  }

  @method
  async getAccount(userAuth: UserAuth): Promise<AccountResponse> {
    const account = await this.queries.getAccount(userAuth.id)
    if (account == null) throw ERR_NOT_FOUND({ message: 'Account not found' }).log(this.logger)
    return toAccountResponse(account, await this.queries.getRoles())
  }
}
```

**`schemas.ts` — the Zod contracts** for command inputs and outputs, plus the
mapping helpers (`toAccountResponse`) that turn repository records into response
shapes.

**`commands.ts` — the public surface.** Wraps service methods as commands (next
section).

The discipline is exact: SQL only in `repository/`, logic only in `services/`,
the contract only in `commands.ts` + `schemas.ts`. "Where does X live?" always
has the same answer.

## The Command Pattern

Commands are how the module's services become callable from outside core. They
are produced by `CoreUtils.createCommand` (`lib/utils.ts`) and declared on a
`*Commands` class, one per public operation:

```ts
export class AccountCommands {
  constructor(deps: { utils: CoreUtils; service: AccountService }) {
    this.utils = deps.utils
    this.accountService = deps.service
  }

  @cached get getAccount() {
    return this.utils.createCommand({
      method: 'getAccount',
      auth: { mode: 'user', abilities: ['account:read_own'] },
      schemas: { input: z.void(), output: accountResponseSchema },
      handler: this.accountService.getAccount.bind(this.accountService),
    })
  }
}
```

`createCommand` returns a callable annotated with its `method`, `auth`, and
`schemas`, and wraps the handler with a fixed pipeline:

1. **Establish a log context** for the call (`request_id`, `command`, and the
   actor id) via `withLogContext`.
2. **Enforce authorization** — for `user`/`admin` modes it calls
   `assertAbilities` / `assertAdminAbilities` with the abilities declared on the
   command, before the handler runs.
3. **Validate input** against `schemas.input` (Zod).
4. **Invoke the handler** with the arguments appropriate to the auth mode —
   `callHandler` passes `(input)` for `none`, or `(actorAuth, input)` for
   `user`/`admin`/`agent`.
5. **Validate output** against `schemas.output`.
6. **Return a `Result`** — `Result.Ok(output)` on success, or `Result.Err(...)`
   produced by `reportError` on failure. Commands do not throw across the
   boundary; expected failures come back as typed error values.

The auth mode also determines the *static* shape of the call. A command's
signature is `(ctx: RequestContextType[Mode], input) => Promise<Result<...>>`, so
passing a `UserRequestContext` to an `admin` command is a type error. The auth
modes and their contexts:

| Mode | Required context | Handler receives |
| --- | --- | --- |
| `none` | `RequestContext` | `(input)` |
| `user` | `UserRequestContext` | `(userAuth, input)` |
| `admin` | `AdminRequestContext` | `(adminAuth, input)` |
| `agent` | `AgentRequestContext` | `(agentAuth, input)` |

### The `@cached` getter

Commands are exposed as getters so they're only constructed on first use, but a
command should be a stable singleton. The `@cached` decorator (`lib/utils.ts`)
memoises a getter by redefining the property with its computed value on first
access:

```ts
export function cached<This, T>(target: (this: This) => T, { kind, name }) {
  if (kind === 'getter') {
    return function (this: This) {
      const result = target.call(this)
      Object.defineProperty(this, name, { value: result, writable: false })
      return result
    }
  }
}
```

### Projecting commands into the facade

After a module registry is composed, its `commands` object is the only part
lifted into the public facade. The `get*Commands` projector does this and, via
`RegisteredServices`, stays fully typed:

```ts
export const getAppCommands = (services: RegisteredServices<AppRegistry>) => ({
  account: services.account.commands,
  activities: services.activities.commands,
  session: services.session.commands,
  registration: services.registration.commands,
  lti: services.lti.commands,
})
```

The services and repositories behind those commands remain private to the
composed graph.

## Shared Machinery

Two pieces of infrastructure are used by nearly every service.

### BaseService and structured logging

`BaseService` (`lib/base-service.ts`) gives every service a logger and a stored
`{ domain, module, class }` metadata triple (set via its `super(logger, domain,
module)` call). The `@method` decorator wraps a method so that, for its whole
execution, the active log context carries `{ domain, module, class, method }`
plus trace-level enter/exit lines:

```ts
@method
async getAccount(userAuth: UserAuth) { … }
```

Combined with the command-level context (`request_id`, `command`, actor id), this
means a single request can be followed through the logs from the command down
into the repository without threading a logger argument by hand. `withLogContext`
(`lib/logger.ts`) holds the active context in `AsyncLocalStorage`.

### Database access and transactions

Two thin contracts mediate all DB access (`lib/db-manager.ts`):

- **`DBManager`** — `get()` returns the Drizzle handle. Crucially it returns the
  *transaction* handle if one is active for the current async context, otherwise
  the pool:

  ```ts
  get(): DB { return transactionALS.getStore() ?? this.dbPool }
  ```

- **`TXManager`** — `withTransaction(fn)` opens a Drizzle transaction and runs
  `fn` inside an `AsyncLocalStorage` scope bound to that transaction handle.

Because repositories always call `this.db.get()`, any work performed inside a
`tx.withTransaction(...)` callback automatically uses the transaction — no
transaction handle has to be passed down through service and repository method
signatures. A service composes a multi-step write simply by wrapping it:

```ts
await this.tx.withTransaction(async () => {
  await this.mutations.updateX(...)
  await this.mutations.insertY(...)
})
```

(One caveat noted in the code: nested `withTransaction` calls are currently
allowed and would reuse the outer transaction's store rather than open a true
savepoint.)

## Putting It Together: Initialization

`initCore` (`core.ts`) composes the whole graph once and returns the facade plus
a background-jobs handle:

```ts
const registry = await createCoreRegistry(urlBuilder, config).compose({ pinoLogger })

const commands: CoreCommands = {
  app: getAppCommands(registry.app),
  admin: getAdminCommands(registry.admin),
  agent: getAgentCommands(registry.agent),
}
```

The host holds the result as a singleton and calls commands per request — see
[ARCHITECTURE → Single-instance](./ARCHITECTURE.md#3-single-instance-no-separate-api-server)
and `apps/gradebook/src/core-adapter.ts`.

One related composition is kept deliberately separate: **token verification**
(`public/tokens.ts`) builds its own small `AsyncRegistry` of the three verifiers
so the host can validate a token without composing the full core graph (and
without a DB pool). This is exported as the `@modulus-learning/core/tokens`
entry point and is what `getCoreTokenVerifiers` in the host adapter uses.

## Why This Design

- **Wiring errors are compile errors.** The `ValidateDeps` machinery turns the
  usual class of DI runtime failures — missing or mis-typed dependencies, wrong
  ordering — into type errors at the `add*` call site.
- **Contracts, not constructions.** Services depend on named contracts in the
  context, not on concrete imports they `new` up themselves. This is exactly what
  makes implementations swappable, and is the foundation the planned
  [remote connector](./REMOTE-CONNECTOR.md) builds on — a proxy implementation of
  a contract can be registered in place of the in-process one.
- **Uniformity.** Every module has the same four-part shape and every service the
  same logging/transaction story, so the codebase reads the same everywhere.

What it costs: a fair amount of advanced TypeScript in `registry.ts` and
`utils.ts` that is dense to read, and the indirection of "find the provider, then
the class" when tracing a dependency. The trade is made deliberately — the wiring
is written once and checked forever after.

---

## Where to go next

- [ARCHITECTURE](./ARCHITECTURE.md) — the decisions this document expands on.
- [DATA-MODEL](./DATA-MODEL.md) — what the repositories read and write.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — `RequestContext`, the actor auth objects, and
  how `assertAbilities` enforces the abilities declared on each command.
