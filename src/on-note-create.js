const note = api.originEntity;
const parentNote = note.getParentNotes()[0];

api.log("Detected new task note: " + note.noteId);

note.setRelation("taskStatus", parentNote.noteId);