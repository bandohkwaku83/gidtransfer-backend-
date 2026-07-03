import express from "express"
import {
    createBooking,
    deleteBooking,
    getBooking,
    getBookingCalendar,
    getBookingsMeta,
    getBookingsStats,
    getBookingsWeekSummary,
    getUpcomingBooking,
    listBookings,
    updateBooking,
} from "../controllers/bookingController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/meta", getBookingsMeta)
router.get("/week-summary", getBookingsWeekSummary)
router.get("/stats", getBookingsStats)
router.get("/upcoming", getUpcomingBooking)
router.get("/", listBookings)
router.get("/:id/calendar", getBookingCalendar)
router.get("/:id", getBooking)
router.post("/", createBooking)
router.put("/:id", updateBooking)
router.delete("/:id", deleteBooking)

export default router
