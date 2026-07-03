import { handleGalleryCoverUpload } from "./uploadGalleryCover.js"

/** Run multer only for multipart uploads so JSON bodies stay intact from express.json(). */
export const multipartGalleryCoverOptional = (req, res, next) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase()
    if (ct.includes("multipart/form-data")) {
        return handleGalleryCoverUpload(req, res, next)
    }
    return next()
}
