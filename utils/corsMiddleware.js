import cors from "cors"

function splitOrigins(raw) {
    return String(raw || "")
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean)
}

export function buildCorsMiddleware() {
    const fromEnv = splitOrigins(process.env.CORS_ORIGINS)
    const allowList =
        fromEnv.length > 0
            ? fromEnv
            : process.env.NODE_ENV === "production"
              ? []
              : null

    const originOption = allowList === null ? true : allowList

    if (process.env.NODE_ENV === "production") {
        console.log(
            `[cors] allowed origins: ${allowList.length ? allowList.join(", ") : "(none — set CORS_ORIGINS)"}`
        )
    } else {
        console.log("[cors] development: all origins allowed")
    }

    return cors({
        origin: originOption,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        maxAge: 86_400,
    })
}
