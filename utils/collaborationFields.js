export const ROLE_RANK = {
    viewer: 1,
    editor: 2,
    owner: 3,
}

export const roleAtLeast = (role, minRole) =>
    (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 99)

export const normalizeMemberRole = (raw) => {
    const role = String(raw ?? "editor").trim().toLowerCase()
    if (role === "editor" || role === "viewer") return role
    return null
}

export const formatUserBrief = (user) => {
    if (!user) return null
    const id = user._id ? String(user._id) : String(user)
    if (typeof user === "string" || !user.email) {
        return { id }
    }
    return {
        id,
        email: user.email ?? "",
        name:
            user.studio?.companyName?.trim() ||
            user.name?.trim() ||
            user.email?.split("@")[0] ||
            "",
        companySlug: user.studio?.companySlug ?? "",
    }
}

export const formatWorkspaceResponse = (workspace, { role = null, memberCount = null } = {}) => {
    const doc = workspace?.toObject ? workspace.toObject() : workspace
    return {
        id: String(doc._id),
        name: doc.name ?? "",
        description: doc.description ?? "",
        status: doc.status ?? "active",
        ownerId: doc.owner?._id
            ? String(doc.owner._id)
            : doc.owner
              ? String(doc.owner)
              : null,
        owner: doc.owner && typeof doc.owner === "object" && doc.owner.email
            ? formatUserBrief(doc.owner)
            : null,
        linkedGalleryId: doc.linkedGallery
            ? String(doc.linkedGallery._id ?? doc.linkedGallery)
            : null,
        role: role ?? null,
        memberCount: memberCount != null ? Number(memberCount) : null,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    }
}

export const formatMemberResponse = (member) => {
    const doc = member?.toObject ? member.toObject() : member
    return {
        id: String(doc._id),
        workspaceId: String(doc.workspace._id ?? doc.workspace),
        userId: String(doc.user._id ?? doc.user),
        user:
            doc.user && typeof doc.user === "object" && doc.user.email
                ? formatUserBrief(doc.user)
                : null,
        email: doc.email ?? "",
        role: doc.role,
        status: doc.status,
        invitedById: doc.invitedBy
            ? String(doc.invitedBy._id ?? doc.invitedBy)
            : null,
        inviteExpiresAt: doc.inviteExpiresAt ?? null,
        acceptedAt: doc.acceptedAt ?? null,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    }
}

export const formatFolderResponse = (folder) => {
    const doc = folder?.toObject ? folder.toObject() : folder
    return {
        id: String(doc._id),
        workspaceId: String(doc.workspace._id ?? doc.workspace),
        name: doc.name ?? "",
        sortOrder: doc.sortOrder ?? 0,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    }
}

export const formatAssetResponse = (asset, urlHelpers = {}) => {
    const doc = asset?.toObject ? asset.toObject() : asset
    const workspaceId = String(doc.workspace._id ?? doc.workspace)
    const publicUrl =
        urlHelpers.assetPublicUrl?.(workspaceId, doc.storedFilename) ??
        doc.url ??
        null
    const thumbUrl = doc.thumbStoredFilename
        ? urlHelpers.assetPublicUrl?.(workspaceId, doc.thumbStoredFilename)
        : null
    const previewUrl = doc.previewStoredFilename
        ? urlHelpers.assetPublicUrl?.(workspaceId, doc.previewStoredFilename)
        : null

    return {
        id: String(doc._id),
        workspaceId,
        folderId: doc.folder ? String(doc.folder._id ?? doc.folder) : null,
        originalFilename: doc.originalFilename ?? "",
        mimeType: doc.mimeType ?? "",
        sizeBytes: doc.sizeBytes ?? 0,
        isVideo: doc.isVideo === true,
        sortOrder: doc.sortOrder ?? 0,
        url: publicUrl,
        thumbUrl: thumbUrl ?? null,
        previewUrl: previewUrl ?? null,
        uploadedById: doc.uploadedBy
            ? String(doc.uploadedBy._id ?? doc.uploadedBy)
            : null,
        uploadedBy:
            doc.uploadedBy &&
            typeof doc.uploadedBy === "object" &&
            doc.uploadedBy.email
                ? formatUserBrief(doc.uploadedBy)
                : null,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    }
}
