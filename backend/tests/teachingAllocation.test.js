import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import teachingAllocationRouter from "../routes/api/teachingAllocation.js";
import TeachingAllocation from "../models/TeachingAllocation.js";
import Subject from "../models/Subject.js";
import AllocationAudit from "../models/AllocationAudit.js";
import { validateOwnership, validateOwnershipMany } from "../utils/validateTenantRefs.js";

vi.mock("../models/Class.js");
vi.mock("../models/Subject.js");
vi.mock("../models/Faculty.js");
vi.mock("../models/ClassSubject.js");
vi.mock("../models/TeacherSubjectCombination.js");
vi.mock("../models/TeachingAllocation.js");
vi.mock("../models/AllocationAudit.js");
vi.mock("../utils/validateTenantRefs.js", () => ({
  validateOwnership: vi.fn(),
  validateOwnershipMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("../middleware/auth.js", () => ({
  default: (req, res, next) => {
    req.user = { _id: "admin-1", role: "admin", collegeId: "bmsit" };
    next();
  },
}));

describe("Teaching Allocation API Routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.collegeId = "bmsit";
      next();
    });
    app.use("/api", teachingAllocationRouter);
    AllocationAudit.create.mockResolvedValue({});
  });

  describe("GET /api/teaching-allocations", () => {
    it("returns allocations scoped to the college", async () => {
      const populateChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: "alloc-1",
            classIds: [{ _id: "class-1", name: "Class 1" }],
            subject: { _id: "sub-1", name: "MATHS", type: "theory" },
            teacher: { _id: "t-1", name: "T1" },
            teachers: [{ _id: "t-1", name: "T1" }],
            subjects: [],
            hoursPerWeek: 4,
          },
        ]),
      };
      TeachingAllocation.find.mockReturnValue(populateChain);

      const res = await request(app).get("/api/teaching-allocations");

      expect(res.status).toBe(200);
      expect(TeachingAllocation.find).toHaveBeenCalledWith({ collegeId: "bmsit" });
      expect(res.body).toHaveLength(1);
      expect(res.body[0].hoursPerWeek).toBe(4);
    });
  });

  describe("POST /api/teaching-allocations", () => {
    it("rejects when classIds or subjectId are missing", async () => {
      const res = await request(app).post("/api/teaching-allocations").send({});

      expect(res.status).toBe(400);
      expect(TeachingAllocation.create).not.toHaveBeenCalled();
    });

    it("creates a NORMAL allocation for a theory subject with one teacher", async () => {
      validateOwnershipMany.mockResolvedValue([]);
      validateOwnership.mockResolvedValue({ _id: "sub-1", type: "theory", classesPerWeek: 4 });
      TeachingAllocation.findOne.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null),
      });
      const created = { _id: "alloc-1", toObject: () => ({ _id: "alloc-1" }) };
      TeachingAllocation.create.mockResolvedValue(created);
      TeachingAllocation.findOne.mockReturnValueOnce({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: "alloc-1", classIds: [], subjects: [] }),
      });

      const res = await request(app)
        .post("/api/teaching-allocations")
        .send({ classIds: ["class-1"], subjectId: "sub-1", teacherIds: ["t-1"] });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(TeachingAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({ collegeId: "bmsit", type: "NORMAL", hoursPerWeek: 4 })
      );
      expect(AllocationAudit.create).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE" }));
    });

    it("returns 400 when a no_teacher subject is given a teacher", async () => {
      validateOwnershipMany.mockResolvedValue([]);
      validateOwnership.mockResolvedValue({ _id: "sub-1", type: "no_teacher", classesPerWeek: 4 });

      const res = await request(app)
        .post("/api/teaching-allocations")
        .send({ classIds: ["class-1"], subjectId: "sub-1", teacherIds: ["t-1"] });

      expect(res.status).toBe(400);
      expect(TeachingAllocation.create).not.toHaveBeenCalled();
    });

    it("returns 409 when the same allocation already exists", async () => {
      validateOwnershipMany.mockResolvedValue([]);
      validateOwnership.mockResolvedValue({ _id: "sub-1", type: "theory", classesPerWeek: 4 });
      TeachingAllocation.findOne.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: "existing" }),
      });

      const res = await request(app)
        .post("/api/teaching-allocations")
        .send({ classIds: ["class-1"], subjectId: "sub-1", teacherIds: ["t-1"] });

      expect(res.status).toBe(409);
      expect(TeachingAllocation.create).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/teaching-allocations", () => {
    it("requires an allocationId", async () => {
      const res = await request(app).delete("/api/teaching-allocations").send({});

      expect(res.status).toBe(400);
    });

    it("deletes an allocation scoped to the college and writes an audit entry", async () => {
      TeachingAllocation.findOneAndDelete.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: "alloc-1", source: "DIRECT" }),
      });

      const res = await request(app).delete("/api/teaching-allocations").send({ id: "alloc-1" });

      expect(res.status).toBe(200);
      expect(TeachingAllocation.findOneAndDelete).toHaveBeenCalledWith({ _id: "alloc-1", collegeId: "bmsit" });
      expect(AllocationAudit.create).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE" }));
    });

    it("returns 404 when the allocation does not belong to the college", async () => {
      TeachingAllocation.findOneAndDelete.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const res = await request(app).delete("/api/teaching-allocations").send({ id: "missing" });

      expect(res.status).toBe(404);
      expect(AllocationAudit.create).not.toHaveBeenCalled();
    });
  });
});
