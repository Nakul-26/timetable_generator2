// Shared dataset for scripts/seeds/seed.js. Ported from the old seed_data.js /
// seedNewData.js / seed_only_teachers.js / seed_teachers_and_subjects.js / add_classes.js /
// add_new_subjects.js / seedCombos.js, which all seeded overlapping slices of this same
// PU-college dataset directly against Faculty/Subject/Class/Combo with no collegeId — none
// of them can save against the current schema (collegeId is now required on every doc).
export const DEMO_DATASET = {
  subjects: [
    { id: "ENGLISH", name: "ENGLISH", sem: 1, type: "theory", hoursPerWeek: 4 },
    { id: "KANNADA", name: "KANNADA", sem: 1, type: "theory", hoursPerWeek: 4 },
    { id: "PHYSICS", name: "PHYSICS", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "CHEMISTRY", name: "CHEMISTRY", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "MATHS", name: "MATHS", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "BIOLOGY", name: "BIOLOGY", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "COMPUTER_SCIENCE", name: "COMPUTER SCIENCE", sem: 1, type: "theory", hoursPerWeek: 4 },
    { id: "ACCOUNTS", name: "ACCOUNTS", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "BUSINESS", name: "BUSINESS", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "ECONOMICS", name: "ECONOMICS", sem: 1, type: "theory", hoursPerWeek: 5 },
    { id: "HINDI", name: "HINDI", sem: 1, type: "theory", hoursPerWeek: 4 },
  ],

  faculties: [
    { id: "ARD", name: "ARD" }, { id: "ML", name: "ML" }, { id: "SPN", name: "SPN" }, { id: "NK", name: "NK" },
    { id: "KSG", name: "KSG" }, { id: "MN", name: "MN" }, { id: "ASK", name: "ASK" },
    { id: "SN", name: "SN" }, { id: "MS", name: "MS" }, { id: "USA", name: "USA" }, { id: "BRV", name: "BRV" },
    { id: "VM", name: "VM" }, { id: "VV", name: "VV" }, { id: "SG", name: "SG" }, { id: "JK", name: "JK" },
    { id: "YPN", name: "YPN" }, { id: "RM", name: "RM" }, { id: "RSK", name: "RSK" }, { id: "SMS", name: "SMS" }, { id: "NNK", name: "NNK" },
    { id: "MHK", name: "MHK" }, { id: "HN", name: "HN" }, { id: "SRP", name: "SRP" },
    { id: "ANB", name: "ANB" }, { id: "TNR", name: "TNR" }, { id: "ATP", name: "ATP" }, { id: "SJ", name: "SJ" },
    { id: "SPB", name: "SPB" }, { id: "GCS", name: "GCS" }, { id: "RNK", name: "RNK" },
    { id: "GCV", name: "GCV" }, { id: "RP", name: "RP" }, { id: "KLG", name: "KLG" },
    { id: "SRK", name: "SRK" }, { id: "NM", name: "NM" }, { id: "GS", name: "GS" },
  ],

  classes: [
    { id: "S1", name: "S1", section: "S1", sem: 2 }, { id: "S2", name: "S2", section: "S2", sem: 2 },
    { id: "S3", name: "S3", section: "S3", sem: 2 }, { id: "S4", name: "S4", section: "S4", sem: 2 },
    { id: "S5", name: "S5", section: "S5", sem: 2 }, { id: "S6", name: "S6", section: "S6", sem: 2 },
    { id: "S7", name: "S7", section: "S7", sem: 2 },
    { id: "J1", name: "J1", section: "J1", sem: 1 }, { id: "J2", name: "J2", section: "J2", sem: 1 },
    { id: "J3", name: "J3", section: "J3", sem: 1 }, { id: "J4", name: "J4", section: "J4", sem: 1 },
    { id: "J5", name: "J5", section: "J5", sem: 1 }, { id: "J6", name: "J6", section: "J6", sem: 1 },
    { id: "J7", name: "J7", section: "J7", sem: 1 }, { id: "J8", name: "J8", section: "J8", sem: 1 },
  ],

  // subject -> teacher ids -> class ids this subject/teacher pairing applies to
  mappings: [
    { subject: "PHYSICS", teachers: ["SN", "MS", "USA"], classes: ["J1", "J2", "J3", "J4", "J5", "S1", "S2", "S3", "S4"] },
    { subject: "PHYSICS", teachers: ["BRV"], classes: ["S1", "S2", "S3", "S4"] },
    { subject: "CHEMISTRY", teachers: ["VM", "VV", "SG", "JK"], classes: ["J1", "J2", "J3", "J4", "J5", "S1", "S2", "S3", "S4"] },
    { subject: "MATHS", teachers: ["YPN", "RM", "RSK", "SMS"], classes: ["J1", "J2", "J3", "J4", "J5", "S1", "S2", "S3", "S4"] },
    { subject: "MATHS", teachers: ["NNK"], classes: ["S1", "S2", "S3", "S4"] },
    { subject: "BIOLOGY", teachers: ["MHK", "HN", "SRP"], classes: ["J3", "J4", "J5", "S3", "S4"] },
    { subject: "COMPUTER SCIENCE", teachers: ["ANB", "TNR", "ATP", "SJ"], classes: ["J1", "J2", "J4", "S1", "S2", "S4"] },
    { subject: "ACCOUNTS", teachers: ["SPB", "GCS", "RNK"], classes: ["J6", "J7", "J8", "S5", "S6", "S7"] },
    { subject: "BUSINESS", teachers: ["GCV", "RP", "KLG"], classes: ["J6", "J7", "J8", "S5", "S6", "S7"] },
    { subject: "ECONOMICS", teachers: ["SRK", "NM", "GS"], classes: ["J6", "J7", "J8", "S5", "S6", "S7"] },
    {
      subject: "ENGLISH", teachers: ["ARD", "ML", "SPN", "NK"],
      classes: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"],
    },
    {
      subject: "KANNADA", teachers: ["KSG", "MN", "ASK"],
      classes: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"],
    },
    {
      subject: "HINDI", teachers: ["RM"],
      classes: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"],
    },
  ],
};
