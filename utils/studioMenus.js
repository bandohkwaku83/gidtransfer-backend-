/**
 * App menus a studio owner can grant to team members.
 * Owner always has every menu; billing + team stay owner-only.
 */
export const STUDIO_MENU_CATALOG = [
    {
        key: "dashboard",
        label: "Dashboard",
        description: "Studio home and overview",
    },
    {
        key: "clients",
        label: "Clients",
        description: "Client CRM",
    },
    {
        key: "galleries",
        label: "Galleries",
        description: "Client galleries, uploads, share links",
    },
    {
        key: "bookings",
        label: "Bookings",
        description: "Shoot calendar and bookings",
    },
    {
        key: "income",
        label: "Income",
        description: "Income tracking",
    },
    {
        key: "collaborations",
        label: "Collaborations",
        description: "Shared project workspaces",
    },
    {
        key: "storage",
        label: "Storage",
        description: "Storage usage",
    },
    {
        key: "trash",
        label: "Trash",
        description: "Restore deleted items",
    },
    {
        key: "settings",
        label: "Settings",
        description: "Studio profile, watermark, defaults",
    },
]

/** Never assignable to staff — owner only. */
export const OWNER_ONLY_MENU_KEYS = ["billing", "team"]

export const ALL_ASSIGNABLE_MENU_KEYS = STUDIO_MENU_CATALOG.map((m) => m.key)

export const STUDIO_ROLE_PRESETS = {
    admin: {
        key: "admin",
        label: "Admin",
        description: "Most studio tools except billing and team management",
        menuKeys: [...ALL_ASSIGNABLE_MENU_KEYS],
    },
    editor: {
        key: "editor",
        label: "Editor",
        description: "Day-to-day client and gallery work",
        menuKeys: [
            "dashboard",
            "clients",
            "galleries",
            "bookings",
            "collaborations",
            "storage",
        ],
    },
    viewer: {
        key: "viewer",
        label: "Viewer",
        description: "Read-oriented access",
        menuKeys: ["dashboard", "clients", "galleries", "bookings", "storage"],
    },
}

export const STUDIO_ROLE_KEYS = Object.keys(STUDIO_ROLE_PRESETS)

export const isAssignableMenuKey = (key) =>
    ALL_ASSIGNABLE_MENU_KEYS.includes(String(key ?? "").trim())

export const sanitizeMenuKeys = (keys) => {
    if (!Array.isArray(keys)) return null
    const next = []
    const seen = new Set()
    for (const raw of keys) {
        const key = String(raw ?? "").trim()
        if (!isAssignableMenuKey(key) || seen.has(key)) continue
        if (OWNER_ONLY_MENU_KEYS.includes(key)) continue
        seen.add(key)
        next.push(key)
    }
    return next
}

export const resolveMenuKeysForRole = (roleKey, overrideKeys = null) => {
    const role = STUDIO_ROLE_PRESETS[String(roleKey ?? "").trim()]
    if (!role) return null
    if (overrideKeys != null) {
        const sanitized = sanitizeMenuKeys(overrideKeys)
        return sanitized ?? [...role.menuKeys]
    }
    return [...role.menuKeys]
}

export const formatMenuCatalog = () =>
    STUDIO_MENU_CATALOG.map((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        assignable: true,
    })).concat(
        OWNER_ONLY_MENU_KEYS.map((key) => ({
            key,
            label: key === "billing" ? "Billing" : "Team",
            description:
                key === "billing"
                    ? "Plans and payments (owner only)"
                    : "Manage studio team (owner only)",
            assignable: false,
        }))
    )

export const formatRolePresets = () =>
    Object.values(STUDIO_ROLE_PRESETS).map((role) => ({
        key: role.key,
        label: role.label,
        description: role.description,
        menuKeys: [...role.menuKeys],
    }))
