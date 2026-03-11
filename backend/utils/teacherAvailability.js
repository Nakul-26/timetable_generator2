export function normalizeAvailabilitySlots(rawSlots = []) {
  const slots = Array.isArray(rawSlots) ? rawSlots : [];
  const normalized = [];
  const seen = new Set();

  for (const slot of slots) {
    const day = Number(slot?.day);
    const hour = Number(slot?.hour);
    if (!Number.isInteger(day) || day < 0) continue;
    if (!Number.isInteger(hour) || hour < 0) continue;

    const key = `${day}|${hour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ day, hour });
  }

  return normalized.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.hour - b.hour;
  });
}

export function buildUnavailableSlotsByTeacher(faculties = []) {
  const out = {};

  for (const faculty of faculties) {
    const teacherId = String(faculty?._id || "");
    if (!teacherId) continue;

    const slots = normalizeAvailabilitySlots(faculty?.unavailableSlots || []);
    if (slots.length > 0) {
      out[teacherId] = slots;
    }
  }

  return out;
}

export function mergeTeacherAvailabilityConstraintConfig(
  constraintConfig = {},
  faculties = []
) {
  const teacherAvailability = constraintConfig?.teacherAvailability || {};
  const unavailableSlotsByTeacher = buildUnavailableSlotsByTeacher(faculties);

  return {
    ...constraintConfig,
    teacherAvailability: {
      ...teacherAvailability,
      unavailableSlotsByTeacher,
    },
  };
}
