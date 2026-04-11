import { ERR_FORBIDDEN } from './errors.js'

export class UserAuth {
  constructor(
    public readonly id: string,
    public readonly abilities: string[]
  ) {}

  hasAbility(ability: string) {
    return this.abilities.includes(ability)
  }

  assertAbility(ability: string, message = `missing required ability: ${ability}`) {
    if (!this.abilities.includes(ability)) {
      // TODO: Should this and related methods below include a stack trace?
      throw ERR_FORBIDDEN({ message: message })
    }
  }

  assertAbilities(
    abilities: string[],
    message: (ability: string) => string = (ability) => `missing required ability: ${ability}`
  ) {
    for (const ability of abilities) {
      if (!this.abilities.includes(ability)) {
        throw ERR_FORBIDDEN({ message: message(ability) })
      }
    }
  }
}

export class AdminAuth {
  constructor(
    public readonly admin_id: string,
    public readonly admin_abilities: string[]
  ) {}

  hasAdminAbility(ability: string) {
    return this.admin_abilities.includes(ability)
  }

  assertAdminAbility(ability: string, message = `missing required ability: ${ability}`) {
    if (!this.admin_abilities.includes(ability)) {
      throw ERR_FORBIDDEN({ message: message })
    }
  }

  assertAdminAbilities(
    abilities: string[],
    message: (ability: string) => string = (ability) => `missing required ability: ${ability}`
  ) {
    for (const ability of abilities) {
      if (!this.admin_abilities.includes(ability)) {
        throw ERR_FORBIDDEN({ message: message(ability) })
      }
    }
  }
}

// TODO
export class AgentAuth {
  constructor(
    public readonly user_id: string,
    public readonly activity_id: string,
    public readonly renew_after: number
  ) {}
}
