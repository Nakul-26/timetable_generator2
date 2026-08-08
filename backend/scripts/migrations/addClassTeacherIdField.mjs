import "../env.js";
import mongoose from "mongoose";

import Class from "../../models/Class.js";

const APPLY = process.argv.includes("--apply");
const DB_NAME = process.env.MONGO_DB_NAME || "timetable_jayanth";
const uri = process.env.MONGO_URI;

if (!uri) {
  throw new Error("MONGO_URI is not defined");
}

async function main() {
  await mongoose.connect(uri, { dbName: DB_NAME });

  const missingCount = await Class.countDocuments({ classTeacherId: { $exists: false } });

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    database: DB_NAME,
    totals: {
      missingField: missingCount,
      updated: 0,
    },
  };

  if (APPLY && missingCount > 0) {
    const result = await Class.updateMany(
      { classTeacherId: { $exists: false } },
      { $set: { classTeacherId: null } }
    );
    report.totals.updated = Number(result.modifiedCount || 0);
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error("[addClassTeacherIdField] Failed:", error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
