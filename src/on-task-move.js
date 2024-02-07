api.log("on-task-move: " + api.originEntity);
console.log(api.originEntity);

// tasklib needs to be a child note (clone)
// TODO: Can I require/import a note from somewhere else instead?
// const tasklib = require("./tasklib");

// withoot runOutsideOfSync, the parent note ends up being the old status not the new one
api.runOutsideOfSync(() => {
  const note = api.originEntity.getNote();
  const parentNote = note.getParentNotes()[0];

  if (!parentNote.hasLabel("tasksStatus")) return;

  const newNoteStatus = parentNote.getLabel("tasksStatus").value;
  const oldNoteStatus = note
    .getOwnedRelation("taskStatus")
    .getTargetNote().title;
  api.log(
    "Detected move task note: " + note.noteId + " to status " + newNoteStatus,
  );
  note.setRelation("taskStatus", parentNote.noteId);

  const cDate = new Date();
  const timestamp = cDate.toISOString();

  if (newNoteStatus == "In Progress") {
    note.setLabel("taskStarted", timestamp);
  } else if (newNoteStatus == "Done") {
    note.setLabel("taskCompleted", timestamp);
  }

  if (newNoteStatus !== "Done" && newNoteStatus !== "Archived") {
    const completedLabel = note.getLabel("taskCompleted");
    if (completedLabel !== null) {
      note.removeLabel("taskCompleted");
    }
  }

  historyMsg = `<strong>${timestamp}</strong>: Status ${oldNoteStatus} -> ${newNoteStatus}`;
  tasklib.addHistoryLog(note, historyMsg, { forceFrontendReload: true });
});
