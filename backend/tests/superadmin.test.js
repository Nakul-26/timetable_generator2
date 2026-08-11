import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import superadminRouter from "../routes/api/superadmin.js";
import College from "../models/College.js";
import Admin from "../models/Admin.js";

vi.mock("../models/College.js");
vi.mock("../models/Admin.js");

let currentUser = { _id: "super-1", role: "superadmin" };
vi.mock("../middleware/auth.js", () => ({
  default: (req, res, next) => {
    req.user = currentUser;
    next();
  },
}));

describe("Superadmin API Routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { _id: "super-1", role: "superadmin" };
    app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
  });

  it("blocks non-superadmin users with 403", async () => {
    currentUser = { _id: "admin-1", role: "admin", collegeId: "bmsit" };

    const res = await request(app).get("/api/superadmin/colleges");

    expect(res.status).toBe(403);
  });

  describe("GET /colleges", () => {
    it("lists all colleges", async () => {
      const colleges = [{ _id: "c1", name: "BMSIT" }];
      College.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(colleges),
      });

      const res = await request(app).get("/api/superadmin/colleges");

      expect(res.status).toBe(200);
      expect(res.body.colleges).toEqual(colleges);
    });
  });

  describe("POST /colleges", () => {
    it("creates a college with a derived collegeId slug", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const created = { _id: "c1", name: "BMS Institute", code: "BMSIT", collegeId: "bmsit" };
      College.create.mockResolvedValue(created);

      const res = await request(app)
        .post("/api/superadmin/colleges")
        .send({ name: "BMS Institute", code: "BMSIT" });

      expect(res.status).toBe(201);
      expect(res.body.college).toEqual(created);
      expect(College.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "BMS Institute", code: "BMSIT", collegeId: "bmsit" })
      );
    });

    it("rejects a duplicate code/collegeId with 409", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "existing" }) });

      const res = await request(app)
        .post("/api/superadmin/colleges")
        .send({ name: "BMS Institute", code: "BMSIT" });

      expect(res.status).toBe(409);
      expect(College.create).not.toHaveBeenCalled();
    });

    it("rejects missing required fields with 400", async () => {
      const res = await request(app).post("/api/superadmin/colleges").send({});

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /colleges/:id", () => {
    it("updates a college", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const updated = { _id: "c1", name: "New Name" };
      College.findByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });

      const res = await request(app).put("/api/superadmin/colleges/c1").send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.college).toEqual(updated);
    });

    it("returns 404 when the college does not exist", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      College.findByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const res = await request(app).put("/api/superadmin/colleges/missing").send({ name: "X" });

      expect(res.status).toBe(404);
    });

    it("returns 400 when nothing to update", async () => {
      const res = await request(app).put("/api/superadmin/colleges/c1").send({});

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /colleges/:id", () => {
    it("deletes a college", async () => {
      College.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "c1" }) });

      const res = await request(app).delete("/api/superadmin/colleges/c1");

      expect(res.status).toBe(204);
    });

    it("returns 404 when the college does not exist", async () => {
      College.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const res = await request(app).delete("/api/superadmin/colleges/missing");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /admins", () => {
    it("creates an admin for an existing college", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "c1", collegeId: "bmsit" }) });
      Admin.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const adminDoc = {
        toObject: () => ({ _id: "a1", email: "a@b.com", collegeId: "bmsit", password: "hashed" }),
      };
      Admin.create.mockResolvedValue(adminDoc);

      const res = await request(app)
        .post("/api/superadmin/admins")
        .send({ email: "a@b.com", password: "password123", collegeId: "bmsit" });

      expect(res.status).toBe(201);
      expect(res.body.admin.password).toBeUndefined();
    });

    it("returns 404 when the college does not exist", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const res = await request(app)
        .post("/api/superadmin/admins")
        .send({ email: "a@b.com", password: "password123", collegeId: "missing" });

      expect(res.status).toBe(404);
    });

    it("returns 409 when the college already has an admin", async () => {
      College.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "c1", collegeId: "bmsit" }) });
      Admin.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "existing-admin" }) });

      const res = await request(app)
        .post("/api/superadmin/admins")
        .send({ email: "a@b.com", password: "password123", collegeId: "bmsit" });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /admins/:id", () => {
    it("deletes an admin", async () => {
      Admin.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "a1" }) });

      const res = await request(app).delete("/api/superadmin/admins/a1");

      expect(res.status).toBe(204);
    });

    it("returns 404 when the admin does not exist", async () => {
      Admin.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const res = await request(app).delete("/api/superadmin/admins/missing");

      expect(res.status).toBe(404);
    });
  });
});
