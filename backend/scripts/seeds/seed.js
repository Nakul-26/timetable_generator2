// Consolidated dev/demo seed script for the current multi-tenant schema.
//
// Supersedes seed_data.js, seedNewData.js, seed_sample_data.js, add_faculties.js,
// seed_admin.js, seed_only_teachers.js, seed_teachers_and_subjects.js, add_classes.js,
// and add_new_subjects.js — all of which predate collegeId scoping. Faculty/Subject/Class
// now require collegeId, so none of those scripts can save a document anymore; this one
// writes real TeachingAllocation records (not the legacy Combo/TeacherSubjectCombination
// models those scripts used) scoped to a single --collegeId.
//
// Usage:
//   node scripts/seeds/seed.js --collegeId=demo --yes
//   node scripts/seeds/seed.js --collegeId=demo --yes --wipe
//   node scripts/seeds/seed.js --collegeId=demo --yes --admin-email=admin@demo.edu --admin-password=changeme123
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Faculty from "../../models/Faculty.js";
import Subject from "../../models/Subject.js";
import Class from "../../models/Class.js";
import Admin from "../../models/Admin.js";
import TeachingAllocation from "../../models/TeachingAllocation.js";
import { buildTeachingAllocationKey } from "../../utils/allocationKey.js";
import { DEMO_DATASET } from "./demoDataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseArgs(argv) {
  const args = { wipe: false, yes: false };
  for (const raw of argv) {
    if (raw === "--wipe") args.wipe = true;
    else if (raw === "--yes") args.yes = true;
    else if (raw.startsWith("--collegeId=")) args.collegeId = raw.slice("--collegeId=".length);
    else if (raw.startsWith("--admin-email=")) args.adminEmail = raw.slice("--admin-email=".length);
    else if (raw.startsWith("--admin-password=")) args.adminPassword = raw.slice("--admin-password=".length);
  }
  return args;
}

async function seedFaculties(collegeId) {
  const facultyByOldId = new Map();
  for (const f of DEMO_DATASET.faculties) {
    const doc = await Faculty.findOneAndUpdate(
      { collegeId, id: f.id },
      { $setOnInsert: { collegeId, id: f.id, name: f.name } },
      { upsert: true, new: true }
    );
    facultyByOldId.set(f.id, doc);
  }
  return facultyByOldId;
}

async function seedSubjects(collegeId) {
  const subjectByName = new Map();
  for (const s of DEMO_DATASET.subjects) {
    const doc = await Subject.findOneAndUpdate(
      { collegeId, id: s.id },
      { $setOnInsert: { collegeId, id: s.id, name: s.name, sem: s.sem, type: s.type, classesPerWeek: s.hoursPerWeek } },
      { upsert: true, new: true }
    );
    subjectByName.set(s.name, doc);
  }
  return subjectByName;
}

async function seedClasses(collegeId) {
  const classById = new Map();
  for (const c of DEMO_DATASET.classes) {
    const doc = await Class.findOneAndUpdate(
      { collegeId, id: c.id },
      { $setOnInsert: { collegeId, id: c.id, name: c.name, section: c.section, sem: c.sem, days_per_week: c.daysPerWeek || 6 } },
      { upsert: true, new: true }
    );
    classById.set(c.id, doc);
  }
  return classById;
}

async function seedTeachingAllocations(collegeId, facultyByOldId, subjectByName, classById) {
  let created = 0;
  let skipped = 0;
  for (const mapping of DEMO_DATASET.mappings) {
    const subjectDoc = subjectByName.get(mapping.subject);
    if (!subjectDoc) {
      console.warn(`Subject not found, skipping mapping: ${mapping.subject}`);
      continue;
    }

    for (const teacherId of mapping.teachers) {
      const facultyDoc = facultyByOldId.get(teacherId);
      if (!facultyDoc) {
        console.warn(`Faculty not found, skipping: ${teacherId}`);
        continue;
      }

      for (const classId of mapping.classes) {
        const classDoc = classById.get(classId);
        if (!classDoc) {
          console.warn(`Class not found, skipping: ${classId}`);
          continue;
        }

        const hoursPerWeek = subjectDoc.classesPerWeek || 4;
        const allocationKey = buildTeachingAllocationKey({
          collegeId,
          type: "NORMAL",
          classIds: [classDoc._id],
          subjectId: subjectDoc._id,
          teacherIds: [facultyDoc._id],
        });

        const existing = await TeachingAllocation.findOne({ collegeId, allocationKey }).select("_id").lean();
        if (existing) {
          skipped += 1;
          continue;
        }

        await TeachingAllocation.create({
          collegeId,
          classIds: [classDoc._id],
          subject: subjectDoc._id,
          teacher: facultyDoc._id,
          teachers: [facultyDoc._id],
          type: "NORMAL",
          subjects: [{ subject: subjectDoc._id, teacher: facultyDoc._id }],
          hoursPerWeek,
          allocationKey,
          source: "DIRECT",
        });
        created += 1;
      }
    }
  }
  return { created, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.collegeId) {
    console.error("Usage: node scripts/seeds/seed.js --collegeId=<id> --yes [--wipe] [--admin-email=... --admin-password=...]");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run seed.js with NODE_ENV=production.");
    process.exit(1);
  }

  if (!args.yes) {
    console.error(`This writes demo Faculty/Subject/Class/TeachingAllocation data for collegeId "${args.collegeId}". Re-run with --yes to confirm.`);
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not defined in .env");
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log("Connected to MongoDB");

  try {
    const { collegeId } = args;

    if (args.wipe) {
      console.log(`Wiping existing demo data for collegeId "${collegeId}"...`);
      await Promise.all([
        Faculty.deleteMany({ collegeId }),
        Subject.deleteMany({ collegeId }),
        Class.deleteMany({ collegeId }),
        TeachingAllocation.deleteMany({ collegeId }),
      ]);
    }

    if (args.adminEmail && args.adminPassword) {
      const existingAdmin = await Admin.findOne({ email: args.adminEmail.toLowerCase() });
      if (existingAdmin) {
        console.log(`Admin ${args.adminEmail} already exists, skipping.`);
      } else {
        await Admin.create({ collegeId, email: args.adminEmail, password: args.adminPassword });
        console.log(`Created admin ${args.adminEmail} for collegeId "${collegeId}".`);
      }
    }

    console.log("Seeding faculties...");
    const facultyByOldId = await seedFaculties(collegeId);
    console.log(`Upserted ${facultyByOldId.size} faculties.`);

    console.log("Seeding subjects...");
    const subjectByName = await seedSubjects(collegeId);
    console.log(`Upserted ${subjectByName.size} subjects.`);

    console.log("Seeding classes...");
    const classById = await seedClasses(collegeId);
    console.log(`Upserted ${classById.size} classes.`);

    console.log("Seeding teaching allocations...");
    const { created, skipped } = await seedTeachingAllocations(collegeId, facultyByOldId, subjectByName, classById);
    console.log(`Teaching allocations created: ${created}, already existed: ${skipped}.`);

    console.log("Seed complete.");
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
