api.log("on-task-move: " + api.originEntity);
console.log(api.originEntity);
// withoot runOutsideOfSync, the parent note ends up being the old status not the new one
api.runOutsideOfSync(() => {
  const note = api.originEntity.getNote();
  const parentNote = note.getParentNotes()[0];

  if (!parentNote.hasLabel('tasksStatus')) return;

  const newNoteStatus = parentNote.getLabel('tasksStatus').value;
  api.log("Detected move task note: " + note.noteId + " to status " + newNoteStatus);
  note.setRelation("taskStatus", parentNote.noteId);

  const cDate = new Date();
  const curTime = cDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const curDate = cDate.toISOString().split('T')[0];
  const timestamp = curDate + " " + curTime;
  
  if (newNoteStatus == "In Progress") {
    note.setLabel('taskStarted', timestamp);
  } else if (newNoteStatus == "Done") {
    note.setLabel('taskCompleted', timestamp);
  }

  
});