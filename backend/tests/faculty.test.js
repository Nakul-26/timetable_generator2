import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import facultyRouter from "../routes/api/faculty.js";
import Faculty from "../models/Faculty.js";
import TeacherSubjectCombination from "../models/TeacherSubjectCombination.js";
import ClassModel from "../models/Class.js";
import { unassignTeacherFromAllocations } from "../services/domain/teachingAllocation.service.js";

vi.mock("../models/Faculty.js");
vi.mock("../models/TeacherSubjectCombination.js");
vi.mock("../models/Class.js");
vi.mock("../services/domain/teachingAllocation.service.js", () => ({
  unassignTeacherFromAllocations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/auth.js", () => ({
  default: (req, res, next) => {
    req.user = { _id: "admin-1", role: "admin", collegeId: "bmsit" };
    next();
  },
}));

describe("Faculty API Routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.collegeId = "bmsit";
      next();
    });
    app.use("/api", facultyRouter);
  });

  describe("GET /api/faculties", () => {
    it("returns faculties scoped to the college", async () => {
      const mockFaculties = [{ _id: "f1", name: "Faculty 1", collegeId: "bmsit" }];
      Faculty.find.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockFaculties) });

      const res = await request(app).get("/api/faculties");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFaculties);
      expect(Faculty.find).toHaveBeenCalledWith({ collegeId: "bmsit" });
    });

    it("returns 500 on a database error", async () => {
      Faculty.find.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error("db down")) });

      const res = await request(app).get("/api/faculties");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/faculties", () => {
    it("creates a new faculty scoped to the college", async () => {
      Faculty.prototype.save = vi.fn().mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/faculties")
        .send({ id: "f2", name: "Faculty 2" });

      expect(res.status).toBe(200);
      expect(Faculty.prototype.save).toHaveBeenCalled();
    });

    it("returns 400 when save fails", async () => {
      Faculty.prototype.save = vi.fn().mockRejectedValue(new Error("validation failed"));

      const res = await request(app).post("/api/faculties").send({ id: "f2" });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/faculties/:id", () => {
    it("updates a faculty scoped to the college", async () => {
      const updated = { _id: "f1", name: "Renamed" };
      Faculty.findOneAndUpdate.mockResolvedValue(updated);

      const res = await request(app)
        .put("/api/faculties/f1")
        .send({ name: "Renamed", id: "f1" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(Faculty.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "f1", collegeId: "bmsit" },
        expect.objectContaining({ name: "Renamed" }),
        expect.objectContaining({ new: true })
      );
    });

    it("returns 404 when the faculty does not belong to the college", async () => {
      Faculty.findOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).put("/api/faculties/nope").send({ name: "X" });

      expect(res.status).toBe(404);
    });
  });

  describe("preferences endpoints", () => {
    it("GET /api/faculties/:id/preferences returns normalized preferences", async () => {
      Faculty.findOne.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: "f1", name: "Faculty 1", preferences: {} }),
      });

      const res = await request(app).get("/api/faculties/f1/preferences");

      expect(res.status).toBe(200);
      expect(res.body.teacherId).toBe("f1");
      expect(res.body.teacherName).toBe("Faculty 1");
    });

    it("GET /api/faculties/:id/preferences returns 404 when missing", async () => {
      Faculty.findOne.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null),
      });

      const res = await request(app).get("/api/faculties/missing/preferences");

      expect(res.status).toBe(404);
    });

    it("POST /api/faculties/:id/preferences updates preferences", async () => {
      Faculty.findOneAndUpdate.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: "f1", name: "Faculty 1", preferences: { avoidFirstPeriod: true } }),
      });

      const res = await request(app)
        .post("/api/faculties/f1/preferences")
        .send({ preferences: { avoidFirstPeriod: true } });

      expect(res.status).toBe(200);
      expect(res.body.preferences.avoidFirstPeriod).toBe(true);
    });
  });

  describe("availability endpoints", () => {
    it("GET /api/faculties/:id/availability returns normalized slots", async () => {
      Faculty.findOne.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: "f1", name: "Faculty 1", unavailableSlots: [] }),
      });

      const res = await request(app).get("/api/faculties/f1/availability");

      expect(res.status).toBe(200);
      expect(res.body.unavailableSlots).toEqual([]);
    });

    it("POST /api/faculties/:id/availability returns 404 when faculty missing", async () => {
      Faculty.findOneAndUpdate.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      const res = await request(app)
        .post("/api/faculties/missing/availability")
        .send({ unavailableSlots: [] });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/faculties/:id", () => {
    it("deletes a faculty and cascades cleanup scoped to the college", async () => {
      Faculty.findOneAndDelete.mockResolvedValue({ _id: "f1" });
      TeacherSubjectCombination.deleteMany.mockResolvedValue({ deletedCount: 2 });
      ClassModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

      const res = await request(app).delete("/api/faculties/f1");

      expect(res.status).toBe(200);
      expect(Faculty.findOneAndDelete).toHaveBeenCalledWith({ _id: "f1", collegeId: "bmsit" });
      expect(TeacherSubjectCombination.deleteMany).toHaveBeenCalledWith({ faculty: "f1", collegeId: "bmsit" });
      expect(ClassModel.updateMany).toHaveBeenCalledWith({ collegeId: "bmsit" }, { $pull: { faculties: "f1" } });
      expect(unassignTeacherFromAllocations).toHaveBeenCalledWith("bmsit", "f1");
    });

    it("returns 404 when the faculty does not belong to the college", async () => {
      Faculty.findOneAndDelete.mockResolvedValue(null);

      const res = await request(app).delete("/api/faculties/nope");

      expect(res.status).toBe(404);
      expect(unassignTeacherFromAllocations).not.toHaveBeenCalled();
    });
  });
});
