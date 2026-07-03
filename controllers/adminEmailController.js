import {
    deleteBrandEmailLogo,
    getBrandEmailLogoPublicUrl,
    getBrandEmailLogoRelativeUrl,
    saveBrandEmailLogo,
} from "../utils/brandEmailLogoStorage.js"

export const getEmailBrandLogo = async (_req, res) => {
    const logoUrl = getBrandEmailLogoRelativeUrl()
    const logoSrc = getBrandEmailLogoPublicUrl()

    return res.status(200).json({
        logoUrl,
        logoSrc,
        uploaded: Boolean(logoUrl),
    })
}

export const uploadEmailBrandLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "logo file is required (PNG or JPG, max 5MB)",
            })
        }

        const saved = await saveBrandEmailLogo(req.file)

        return res.status(200).json({
            message: "Email logo uploaded",
            ...saved,
        })
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message })
        }
        console.error("uploadEmailBrandLogo:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const removeEmailBrandLogo = async (_req, res) => {
    deleteBrandEmailLogo()
    return res.status(200).json({ message: "Email logo removed" })
}
