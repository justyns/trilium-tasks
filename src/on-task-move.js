api.log("on-task-move: " + api.originEntity);
console.log(api.originEntity);

// tasklib needs to be a child note (clone)
// TODO: Can I require/import a note from somewhere else instead?
// const tasklib = require("./tasklib");
// const tasklib = require("./tasklib");

const addHistoryLog = (noteId, message) => {
  // This function runs on the backend, so it can't use async/await.
  const note = api.getNote(noteId);
  let noteContent = note.getContent();
  let historyIndex = noteContent.indexOf("<h2>History</h2>");
  const date = new Date();
  const timestamp = date.toISOString();
  message = `<strong>${timestamp}</strong>: ${message}`;

  if (historyIndex === -1) {
    noteContent += "\n<p></p>\n<h2>History</h2>\n<ul>\n";
    noteContent += `<li>${message}</li>\n</ul>\n`;
  } else {
    // Find the last </ul> tag in the history section
    let historyEndIndex = noteContent.indexOf("</ul>", historyIndex);
    if (historyEndIndex !== -1) {
      // Insert the new log entry before the closing </ul> tag in the history section
      noteContent =
        noteContent.substring(0, historyEndIndex) +
        `<li>${message}</li>\n` +
        noteContent.substring(historyEndIndex);
    }
  }

  note.setContent(noteContent);
};

// withoot runOutsideOfSync, the parent note ends up being the old status not the new one
api.runOutsideOfSync(() => {
  const note = api.originEntity.getNote();
  const parentNote = note.getParentNotes()[0];

  let newNoteStatus;
  if (parentNote.hasLabel("tasksStatus")) {
    newNoteStatus = parentNote.getLabel("tasksStatus").value;
  } else {
    // If the parent note doesn't have a tasksStatus label, it's being archived
    // TODO: Probably not always true
    newNoteStatus = "Archived";
  }

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

  const historyMsg = `Status ${oldNoteStatus} -> ${newNoteStatus}`;
  addHistoryLog(note.noteId, historyMsg);
});
