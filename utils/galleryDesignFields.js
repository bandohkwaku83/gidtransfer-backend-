export const COVER_STYLE_OPTIONS = [
    { id: "cinematic", label: "Cinematic" },
    { id: "collage", label: "Collage" },
    { id: "minimal", label: "Minimal" },
    { id: "bento", label: "Bento" },
    { id: "overlay", label: "Overlay" },
    { id: "card_based", label: "Card" },
    { id: "parallax", label: "Parallax" },
    { id: "hero_carousel", label: "Carousel" },
    { id: "full_bleed", label: "Full bleed" },
    { id: "editorial_card", label: "Editorial" },
    { id: "film_border", label: "Film" },
    { id: "split_feature", label: "Split" },
]

export const COVER_STYLES = COVER_STYLE_OPTIONS.map((option) => option.id)

const COVER_STYLE_ALIASES = {
    card: "card_based",
    carousel: "hero_carousel",
    editorial: "editorial_card",
    film: "film_border",
    split: "split_feature",
    "card-based": "card_based",
    "hero-carousel": "hero_carousel",
    "full-bleed": "full_bleed",
    "editorial-card": "editorial_card",
    "film-border": "film_border",
    "split-feature": "split_feature",
}

export const GRID_STYLE_OPTIONS = [
    { id: "uniform", label: "Uniform Grid" },
    { id: "masonry", label: "Masonry Grid" },
    { id: "bento", label: "Bento Grid" },
    { id: "split", label: "Split Grid" },
    { id: "horizontal_scroll", label: "Horizontal Scrolling Grid" },
    { id: "collage", label: "Collage Grid" },
    { id: "adaptive", label: "Adaptive Responsive Grid" },
]

export const GRID_STYLES = GRID_STYLE_OPTIONS.map((option) => option.id)

const GRID_STYLE_ALIASES = {
    "horizontal-scroll": "horizontal_scroll",
}

/** General color swatches for framed cover styles (preset id or custom hex). */
export const GENERAL_COLOR_PRESETS = [
    { id: "white", label: "White", hex: "#ffffff" },
    { id: "charcoal", label: "Charcoal", hex: "#18181b" },
    { id: "ink", label: "Ink", hex: "#0f172a" },
    { id: "forest", label: "Forest", hex: "#14532d" },
    { id: "wine", label: "Wine", hex: "#4c0519" },
    { id: "navy", label: "Navy", hex: "#1e3a5f" },
    { id: "clay", label: "Clay", hex: "#78350f" },
    { id: "stone", label: "Stone", hex: "#44403c" },
    { id: "cream", label: "Cream", hex: "#f4f1ea" },
]

/** @deprecated Use GENERAL_COLOR_PRESETS */
export const BACKDROP_PRESETS = GENERAL_COLOR_PRESETS.map((preset) => preset.id)

const GENERAL_COLOR_ALIASES = {
    black: "charcoal",
    burgundy: "wine",
    maroon: "wine",
    brown: "clay",
    grey: "stone",
    gray: "stone",
    slate: "navy",
    sienna: "clay",
}

export const TITLE_FONTS = [
    "Playfair Display",
    "Cormorant Garamond",
    "Libre Baskerville",
    "DM Serif Display",
]

export const BODY_FONTS = ["Inter", "DM Sans", "Source Sans 3", "Nunito Sans"]

export const DEFAULT_COVER_STYLE = "full_bleed"
export const DEFAULT_GRID_STYLE = "masonry"
export const DEFAULT_GENERAL_COLOR = "charcoal"
/** @deprecated Use DEFAULT_GENERAL_COLOR */
export const DEFAULT_BACKDROP_COLOR = DEFAULT_GENERAL_COLOR
export const DEFAULT_TITLE_FONT = "Playfair Display"
export const DEFAULT_BODY_FONT = "Inter"

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const normalizeOptionKey = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_")

export const normalizeCoverStyle = (value) => {
    if (value === undefined || value === null || value === "") return null
    const key = normalizeOptionKey(value)
    if (!key) return { error: "coverStyle cannot be empty" }
    const canonical = COVER_STYLE_ALIASES[key] ?? key
    if (!COVER_STYLES.includes(canonical)) {
        return {
            error: `coverStyle must be one of: ${COVER_STYLES.join(", ")}`,
        }
    }
    return { value: canonical }
}

export const normalizeGridStyle = (value) => {
    if (value === undefined || value === null || value === "") return null
    const key = normalizeOptionKey(value)
    if (!key) return { error: "gridStyle cannot be empty" }
    const canonical = GRID_STYLE_ALIASES[key] ?? key
    if (!GRID_STYLES.includes(canonical)) {
        return {
            error: `gridStyle must be one of: ${GRID_STYLES.join(", ")}`,
        }
    }
    return { value: canonical }
}

export const normalizeGeneralColor = (value) => {
    if (value === undefined || value === null || value === "") return null
    const raw = String(value).trim()
    if (!raw) return { error: "generalColor cannot be empty" }
    if (raw.startsWith("#")) {
        if (!HEX_COLOR_RE.test(raw)) {
            return {
                error: "generalColor must be a valid hex color (#RGB or #RRGGBB)",
            }
        }
        return { value: raw.toLowerCase() }
    }
    const key = normalizeOptionKey(raw)
    const canonical = GENERAL_COLOR_ALIASES[key] ?? key
    if (!BACKDROP_PRESETS.includes(canonical)) {
        return {
            error: `generalColor must be one of: ${BACKDROP_PRESETS.join(", ")} or a hex value`,
        }
    }
    return { value: canonical }
}

/** @deprecated Use normalizeGeneralColor */
export const normalizeBackdropColor = normalizeGeneralColor

const parseOptionalColorField = (raw, fieldLabel) => {
    if (raw === undefined) return {}
    if (raw === null || raw === "") return { value: null }
    const parsed = normalizeGeneralColor(raw)
    if (parsed?.error) {
        return {
            error: parsed.error.replace(/^generalColor/, fieldLabel),
        }
    }
    return { value: parsed.value }
}

export const parseGalleryDesignInput = (body) => {
    const fields = {}
    const errors = []

    const coverRaw = body?.coverStyle ?? body?.cover_style
    if (coverRaw !== undefined) {
        const parsed = normalizeCoverStyle(coverRaw)
        if (parsed?.error) errors.push(parsed.error)
        else fields.coverStyle = parsed.value
    }

    const gridRaw = body?.gridStyle ?? body?.grid_style
    if (gridRaw !== undefined) {
        const parsed = normalizeGridStyle(gridRaw)
        if (parsed?.error) errors.push(parsed.error)
        else fields.gridStyle = parsed.value
    }

    const colorRaw =
        body?.generalColor ??
        body?.general_color ??
        body?.backdropColor ??
        body?.backdrop_color
    if (colorRaw !== undefined) {
        const parsed = normalizeGeneralColor(colorRaw)
        if (parsed?.error) errors.push(parsed.error)
        else fields.backdropColor = parsed.value
    }

    const titleRaw = body?.titleFont ?? body?.title_font
    if (titleRaw !== undefined) {
        const trimmed = String(titleRaw).trim()
        if (!trimmed) errors.push("titleFont cannot be empty")
        else fields.titleFont = trimmed.slice(0, 120)
    }

    const bodyRaw = body?.bodyFont ?? body?.body_font
    if (bodyRaw !== undefined) {
        const trimmed = String(bodyRaw).trim()
        if (!trimmed) errors.push("bodyFont cannot be empty")
        else fields.bodyFont = trimmed.slice(0, 120)
    }

    const coverTextRaw =
        body?.coverTextColor !== undefined
            ? body.coverTextColor
            : body?.cover_text_color
    const coverTextParsed = parseOptionalColorField(coverTextRaw, "coverTextColor")
    if (coverTextParsed.error) errors.push(coverTextParsed.error)
    else if (coverTextParsed.value !== undefined) {
        fields.coverTextColor = coverTextParsed.value
    }

    const coverButtonRaw =
        body?.coverButtonColor !== undefined
            ? body.coverButtonColor
            : body?.cover_button_color
    const coverButtonParsed = parseOptionalColorField(
        coverButtonRaw,
        "coverButtonColor"
    )
    if (coverButtonParsed.error) errors.push(coverButtonParsed.error)
    else if (coverButtonParsed.value !== undefined) {
        fields.coverButtonColor = coverButtonParsed.value
    }

    return { fields, errors }
}

const resolveStoredCoverStyle = (value) =>
    normalizeCoverStyle(value)?.value ?? DEFAULT_COVER_STYLE

const resolveStoredGridStyle = (value) =>
    normalizeGridStyle(value)?.value ?? DEFAULT_GRID_STYLE

const resolveStoredGeneralColor = (value) =>
    normalizeGeneralColor(value)?.value ?? DEFAULT_GENERAL_COLOR

const resolveStoredOptionalColor = (value) => {
    if (value === undefined || value === null || value === "") return null
    return normalizeGeneralColor(value)?.value ?? null
}

export const formatGalleryDesignResponse = (gallery) => {
    const g = gallery?.toObject?.() ?? gallery ?? {}
    const coverStyle = resolveStoredCoverStyle(g.coverStyle)
    const gridStyle = resolveStoredGridStyle(g.gridStyle)
    const generalColor = resolveStoredGeneralColor(g.backdropColor)
    const coverTextColor = resolveStoredOptionalColor(g.coverTextColor)
    const coverButtonColor = resolveStoredOptionalColor(g.coverButtonColor)
    const titleFont = g.titleFont ?? DEFAULT_TITLE_FONT
    const bodyFont = g.bodyFont ?? DEFAULT_BODY_FONT

    return {
        coverStyle,
        generalColor,
        backdropColor: generalColor,
        coverTextColor,
        coverButtonColor,
        cover_text_color: coverTextColor,
        cover_button_color: coverButtonColor,
        gridStyle,
        typography: {
            titleFont,
            bodyFont,
        },
        titleFont,
        bodyFont,
    }
}

export const formatGalleryShareDesignSnapshot = (gallery) => {
    const g = gallery?.toObject?.() ?? gallery ?? {}
    const shareCoverTextColor = resolveStoredOptionalColor(g.shareCoverTextColor)
    const shareCoverButtonColor = resolveStoredOptionalColor(
        g.shareCoverButtonColor
    )

    return {
        shareCoverTextColor,
        shareCoverButtonColor,
        share_cover_text_color: shareCoverTextColor,
        share_cover_button_color: shareCoverButtonColor,
    }
}

export const formatGalleryDesignMeta = () => ({
    coverStyles: COVER_STYLE_OPTIONS,
    gridStyles: GRID_STYLE_OPTIONS,
    generalColors: GENERAL_COLOR_PRESETS,
    typography: {
        titleFonts: TITLE_FONTS,
        bodyFonts: BODY_FONTS,
    },
})

export const formatGalleryClientAccessResponse = (gallery) => {
    const g = gallery?.toObject?.() ?? gallery ?? {}
    const passwordProtected = g.passwordProtected === true
    const emailGateEnabled = g.emailGateEnabled === true
    return {
        passwordProtected,
        hasPassword: passwordProtected && Boolean(g.clientPasswordHash),
        allowDownloads: g.allowDownloads !== false,
        emailGateEnabled,
        requireEmailToView: emailGateEnabled,
        backgroundMusicEnabled: g.backgroundMusicEnabled === true,
        backgroundMusicUrl: g.backgroundMusicUrl ?? null,
    }
}
