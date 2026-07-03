export const EMAIL_NOTIFICATION_KEYS = [
    "enabled",
    "bookingReminders",
    "galleryComments",
    "galleryFlags",
    "gallerySelections",
]

const parseBoolean = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback
    if (value === true || value === "true" || value === "1" || value === 1) return true
    if (value === false || value === "false" || value === "0" || value === 0) return false
    return fallback
}

export const defaultEmailNotifications = () => ({
    enabled: true,
    bookingReminders: true,
    galleryComments: true,
    galleryFlags: true,
    gallerySelections: true,
})

export const normalizeEmailNotifications = (value) => {
    const defaults = defaultEmailNotifications()
    const source = value && typeof value === "object" ? value : {}

    return {
        enabled: parseBoolean(source.enabled, defaults.enabled),
        bookingReminders: parseBoolean(
            source.bookingReminders,
            defaults.bookingReminders
        ),
        galleryComments: parseBoolean(
            source.galleryComments,
            defaults.galleryComments
        ),
        galleryFlags: parseBoolean(source.galleryFlags, defaults.galleryFlags),
        gallerySelections: parseBoolean(
            source.gallerySelections,
            defaults.gallerySelections
        ),
    }
}

export const formatEmailNotificationsResponse = (user) =>
    normalizeEmailNotifications(user?.emailNotifications)

export const parseEmailNotificationInput = (body, { partial = true } = {}) => {
    const raw =
        body.emailNotifications ??
        body.email_notifications ??
        body.notifications ??
        body

    const hasAnyField = EMAIL_NOTIFICATION_KEYS.some(
        (key) => raw?.[key] !== undefined
    )
    if (!hasAnyField && partial) {
        return { fields: {}, errors: [] }
    }

    const current = normalizeEmailNotifications({})
    const next = { ...current }

    for (const key of EMAIL_NOTIFICATION_KEYS) {
        if (raw?.[key] !== undefined) {
            next[key] = parseBoolean(raw[key], current[key])
        }
    }

    if (!partial && next.enabled === undefined) {
        next.enabled = true
    }

    return { fields: { emailNotifications: next }, errors: [] }
}

export const photographerWantsEmail = (user, kind) => {
    const prefs = normalizeEmailNotifications(user?.emailNotifications)
    if (!prefs.enabled) return false

    switch (kind) {
        case "booking_confirmation":
        case "booking_reminder":
            return prefs.bookingReminders
        case "gallery_comment":
            return prefs.galleryComments
        case "gallery_flag":
            return prefs.galleryFlags
        case "gallery_selections":
            return prefs.gallerySelections
        default:
            return true
    }
}
