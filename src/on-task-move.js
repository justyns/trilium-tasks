api.log("on-task-move: " + api.originEntity);
console.log(api.originEntity);

const addHistoryLog = (note, message) => {
  let noteContent = note.getContent();
  let historyIndex = noteContent.indexOf("<h2>History</h2>");

  if (historyIndex === -1) {
    noteContent += "\n\n<h2>History</h2>\n<ul>\n";
  } else {
    // Find the last </ul> tag if it exists
    let lastIndex = noteContent.lastIndexOf("</ul>");
    if (lastIndex !== -1) {
      // Remove the closing </ul> tag
      noteContent = noteContent.substring(0, lastIndex);
    }
  }

  noteContent += `<li>${message}</li>\n`;

  // Always ensure the closing </ul> tag is present
  if (!noteContent.endsWith("</ul>\n")) {
    noteContent += "</ul>\n";
  }

  note.setContent(noteContent);
};

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
  addHistoryLog(note, historyMsg, { forceFrontendReload: true });
});
