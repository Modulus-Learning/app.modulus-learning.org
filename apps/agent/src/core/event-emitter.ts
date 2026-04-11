// Lightweight typesafe event emitter.  Based on a few sources, including
// - https://blog.makerx.com.au/a-type-safe-event-emitter-in-node-js/
// - https://stackoverflow.com/questions/67243592/typescript-adding-types-to-eventemitter
//
// To use, provide an `EventTypes` type of the form
//   type MyEvents = {
//     'event-1': [s: string, n: number],
//     'event-2': [],
//   }
//
// Typescript will complain if you attempt to register an incompatibly-typed
// listener for a given event.  For example, the following listener types are
// allowed for MyEvents['event-1']
//   () => void
//   (s: string) => void
//   (s: string, n: number) => void
// and the following are not allowed
//   (n: number) => void
//   (s: string, n: number, x: any) => void
export class EventEmitter<
  EventTypes extends {
    [event: string]: any[]
  },
> {
  #listeners: {
    [Event in keyof EventTypes]?: Array<(...args: EventTypes[Event]) => void>
  } = {}

  on<Event extends keyof EventTypes>(
    event: Event,
    listener: (...args: EventTypes[Event]) => void
  ): () => void {
    const listeners = this.#listeners[event] ?? []
    this.#listeners[event] = [...listeners, listener]
    return () => this.off(event, listener)
  }

  once<Event extends keyof EventTypes>(
    event: Event,
    listener: (...args: EventTypes[Event]) => void
  ): () => void {
    const wrapper = (...args: EventTypes[Event]) => {
      this.off(event, wrapper)
      listener(...args)
    }
    return this.on(event, wrapper)
  }

  off<Event extends keyof EventTypes>(
    event: Event,
    listener: (...args: EventTypes[Event]) => void
  ) {
    const listeners = this.#listeners[event] ?? []
    this.#listeners[event] = listeners.filter((it) => it !== listener)
  }

  emit<Event extends keyof EventTypes>(event: Event, ...args: EventTypes[Event]) {
    for (const listener of this.#listeners[event] ?? []) {
      try {
        listener(...args)
      } catch (err) {
        console.log('Warning -- unhandled exception in event listener\n', err)
      }
    }
  }
}
