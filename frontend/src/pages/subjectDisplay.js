export function getSubjectDisplayName(subject, fallback = "Unknown Subject") {
  if (!subject) {
    return fallback;
  }

  if (typeof subject === "string") {
    return subject || fallback;
  }

  return (
    subject.name ||
    subject.subject?.name ||
    subject.subject_name ||
    subject.subjectName ||
    fallback
  );
}

// `combo` is expected to already be normalized (see utils/comboNormalizer.js) —
// i.e. carrying `subjectId`/`subjectName`, not raw generator/DB field aliases.
export function getComboSubjectDisplayName(combo, subjectById, fallback = "Unknown Subject") {
  if (!combo) {
    return fallback;
  }

  const subjectId = String(combo.subjectId || "");
  return (
    getSubjectDisplayName(combo, "") ||
    getSubjectDisplayName(subjectById?.get?.(subjectId), "") ||
    fallback
  );
}
