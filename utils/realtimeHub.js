import { EventEmitter } from "events"

const hub = new EventEmitter()
hub.setMaxListeners(0)

const ownerChannel = (ownerId) => `owner:${String(ownerId)}`

export const publishOwnerEvent = (ownerId, event, data = {}) => {
    hub.emit(ownerChannel(ownerId), {
        event,
        data,
        id: String(Date.now()),
        at: new Date().toISOString(),
    })
}

export const subscribeOwnerEvents = (ownerId, listener) => {
    const channel = ownerChannel(ownerId)
    hub.on(channel, listener)
    return () => hub.off(channel, listener)
}

export const activeOwnerSubscriberCount = (ownerId) =>
    hub.listenerCount(ownerChannel(ownerId))
