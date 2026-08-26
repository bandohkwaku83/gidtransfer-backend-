import express from "express"
import { protectUser } from "../middleware/userAuth.js"
import { requirePlanFeature } from "../middleware/requirePlanFeature.js"
import { requireMenu } from "../middleware/requireMenu.js"
import { handleGalleryMediaUpload } from "../middleware/uploadGalleryPhotos.js"
import { handleGalleryPhotosUpload } from "../middleware/uploadGalleryPhotos.js"
import { handleGalleryVideosUpload } from "../middleware/uploadGalleryVideos.js"
import {
    createWorkspace,
    deleteWorkspace,
    getWorkspace,
    listWorkspaces,
    purgeWorkspaceAssets,
    updateWorkspace,
} from "../controllers/collaborationController.js"
import {
    acceptInvite,
    declineInvite,
    inviteMember,
    leaveWorkspace,
    listMembers,
    listPendingInvites,
    removeMember,
    resendInvite,
    updateMemberRole,
} from "../controllers/collaborationMemberController.js"
import {
    createFolder,
    deleteFolder,
    listFolders,
    updateFolder,
} from "../controllers/collaborationFolderController.js"
import {
    completeAssetUploads,
    deleteAsset,
    hardDeleteAsset,
    listAssets,
    presignAssetUploads,
    updateAsset,
    uploadAssets,
    withCollabUploadKind,
} from "../controllers/collaborationUploadController.js"

const router = express.Router()

router.use(protectUser)
router.use(requireMenu("collaborations"))

router.get("/invites/pending", listPendingInvites)
router.post("/invites/:token/accept", acceptInvite)
router.post("/invites/:token/decline", declineInvite)

router.get("/", listWorkspaces)
router.post("/", requirePlanFeature("collaboration"), createWorkspace)

router.get("/:id", getWorkspace)
router.patch("/:id", updateWorkspace)
router.delete("/:id", deleteWorkspace)
router.post("/:id/purge-assets", purgeWorkspaceAssets)

router.get("/:id/members", listMembers)
router.post("/:id/invites", inviteMember)
router.post("/:id/invites/accept", acceptInvite)
router.post("/:id/members/:memberId/resend", resendInvite)
router.patch("/:id/members/:memberId", updateMemberRole)
router.delete("/:id/members/:memberId", removeMember)
router.post("/:id/leave", leaveWorkspace)

router.get("/:id/folders", listFolders)
router.post("/:id/folders", createFolder)
router.patch("/:id/folders/:folderId", updateFolder)
router.delete("/:id/folders/:folderId", deleteFolder)

router.get("/:id/media", listAssets)
router.patch("/:id/media/:assetId", updateAsset)
router.delete("/:id/media/:assetId", deleteAsset)
router.delete("/:id/media/:assetId/permanent", hardDeleteAsset)

router.post("/:id/uploads/presign", presignAssetUploads)
router.post("/:id/uploads/complete", completeAssetUploads)
router.post(
    "/:id/uploads/photos/presign",
    withCollabUploadKind("photo"),
    presignAssetUploads
)
router.post(
    "/:id/uploads/photos/complete",
    withCollabUploadKind("photo"),
    completeAssetUploads
)
router.post(
    "/:id/uploads/videos/presign",
    withCollabUploadKind("video"),
    presignAssetUploads
)
router.post(
    "/:id/uploads/videos/complete",
    withCollabUploadKind("video"),
    completeAssetUploads
)

router.post("/:id/uploads", handleGalleryMediaUpload, uploadAssets)
router.post(
    "/:id/uploads/photos",
    withCollabUploadKind("photo"),
    handleGalleryPhotosUpload,
    uploadAssets
)
router.post(
    "/:id/uploads/videos",
    withCollabUploadKind("video"),
    handleGalleryVideosUpload,
    uploadAssets
)

export default router
