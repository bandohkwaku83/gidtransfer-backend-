const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const parsePagination = (query, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) => {
    const pageRaw = Number(query?.page ?? query?.pageNumber ?? 1)
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1

    const limitRaw = Number(query?.limit ?? query?.pageSize ?? defaultLimit)
    const limit =
        Number.isInteger(limitRaw) && limitRaw > 0
            ? Math.min(limitRaw, maxLimit)
            : defaultLimit

    const skip = (page - 1) * limit

    return { page, limit, skip }
}

export const buildPaginationMeta = ({ page, limit, total }) => {
    const safeTotal = Math.max(0, Number(total) || 0)
    const totalPages = limit > 0 ? Math.ceil(safeTotal / limit) : 0

    return {
        page,
        limit,
        total: safeTotal,
        totalPages,
        hasMore: page < totalPages,
    }
}

export const paginatedQuery = (query, pagination) =>
    query.skip(pagination.skip).limit(pagination.limit)
