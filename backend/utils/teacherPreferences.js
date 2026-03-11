function normalizePreferredDays(rawDays = []) {
  const days = Array.isArray(rawDays) ? rawDays : [];
  const out = [];
  const seen = new Set();

  for (const rawDay of days) {
    const day = Number(rawDay);
    if (!Number.isInteger(day) || day < 0) continue;
    if (seen.has(day)) continue;
    seen.add(day);
    out.push(day);
  }

  return out.sort((a, b) => a - b);
}

export function normalizeTeacherPreferences(raw = {}) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const maxConsecutiveRaw = value.maxConsecutive;
  const maxConsecutive =
    maxConsecutiveRaw === null || maxConsecutiveRaw === undefined || maxConsecutiveRaw === ""
      ? null
      : Number(maxConsecutiveRaw);

  return {
    avoidFirstPeriod: Boolean(value.avoidFirstPeriod),
    avoidLastPeriod: Boolean(value.avoidLastPeriod),
    maxConsecutive:
      Number.isInteger(maxConsecutive) && maxConsecutive > 0 ? maxConsecutive : null,
    preferredDays: normalizePreferredDays(value.preferredDays || []),
  };
}

export function buildTeacherPreferencesMap(faculties = []) {
  const out = {};

  for (const faculty of faculties) {
    const teacherId = String(faculty?._id || "");
    if (!teacherId) continue;
    out[teacherId] = normalizeTeacherPreferences(faculty?.preferences || {});
  }

  return out;
}

export function mergeTeacherPreferenceConstraintConfig(
  constraintConfig = {},
  faculties = []
) {
  return {
    ...constraintConfig,
    teacherPreferences: buildTeacherPreferencesMap(faculties),
  };
}
