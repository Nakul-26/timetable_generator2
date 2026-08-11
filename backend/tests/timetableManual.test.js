import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import timetableManualRouter from "../routes/timetableManual.js";
import TimetableResult from "../models/TimetableResult.js";
import { getProcessedAssignments } from "../services/manual-timetable/persistence.service.js";
import { deleteState } from "../state/timetableState.js";

vi.mock("../models/Class.js");
vi.mock("../models/Faculty.js");
vi.mock("../models/Subject.js");
vi.mock("../models/TimetableResult.js");
vi.mock("../services/manual-timetable/persistence.service.js", () => ({
  loadSavedTimetable: vi.fn(),
  saveTimetable: vi.fn().mockResolvedValue(undefined),
  getProcessedAssignments: vi.fn().mockResolvedValue([]),
}));

vi.mock("../middleware/auth.js", () => ({
  default: (req, res, next) => {
    req.user = { _id: "admin-1", role: "admin", collegeId: "bmsit" };
    next();
  },
}));

const COLLEGE_ID = "bmsit";
const USER_ID = "admin-1";
const SESSION_ID = `session-${COLLEGE_ID}-${USER_ID}-new`;

describe("Manual Timetable API Routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    deleteState(SESSION_ID);
    TimetableResult.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    app = express();
    app.use(express.json());
    app.use("/api/manual", timetableManualRouter);
  });

  describe("POST /initialize", () => {
    it("initializes a fresh session for a new user/source combo", async () => {
      const res = await request(app)
        .post("/api/manual/initialize")
        .send({
          classes: [{ _id: "class-1" }],
          faculties: [{ _id: "fac-1" }],
          subjects: [{ _id: "sub-1" }],
          config: { days: 6, hours: 8 },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.classTimetable).toHaveProperty("class-1");
      expect(res.body.lifecycleStatus).toBe("draft");
    });

    it("returns the already-initialized in-memory state on a second call", async () => {
      await request(app)
        .post("/api/manual/initialize")
        .send({ classes: [{ _id: "class-1" }], faculties: [], subjects: [] });

      const secondRes = await request(app)
        .post("/api/manual/initialize")
        .send({ classes: [{ _id: "class-2" }], faculties: [], subjects: [] });

      expect(secondRes.status).toBe(200);
      // Second call should short-circuit to the existing state, not re-initialize with class-2.
      expect(secondRes.body.classTimetable).toHaveProperty("class-1");
      expect(secondRes.body.classTimetable).not.toHaveProperty("class-2");
    });
  });

  describe("GET /processed-assignments", () => {
    it("returns saved timetables from the persistence service", async () => {
      getProcessedAssignments.mockResolvedValue([{ _id: "t1", name: "Saved 1" }]);

      const res = await request(app).get("/api/manual/processed-assignments");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.savedTimetables).toEqual([{ _id: "t1", name: "Saved 1" }]);
      expect(getProcessedAssignments).toHaveBeenCalledWith(COLLEGE_ID);
    });

    it("returns 500 when the persistence service throws", async () => {
      getProcessedAssignments.mockRejectedValue(new Error("db down"));

      const res = await request(app).get("/api/manual/processed-assignments");

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("POST /toggle-lock", () => {
    it("toggles a slot lock on an initialized session", async () => {
      await request(app)
        .post("/api/manual/initialize")
        .send({ classes: [{ _id: "class-1" }], faculties: [], subjects: [] });

      const res = await request(app)
        .post("/api/manual/toggle-lock")
        .send({ classId: "class-1", day: 0, hour: 0 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.lockedSlots["class-1"][0][0]).toBe(true);
    });
  });

  describe("POST /delete", () => {
    it("removes the session state", async () => {
      await request(app)
        .post("/api/manual/initialize")
        .send({ classes: [{ _id: "class-1" }], faculties: [], subjects: [] });

      const res = await request(app).post("/api/manual/delete");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
