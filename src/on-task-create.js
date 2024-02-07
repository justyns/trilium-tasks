const note = api.originEntity;
const parentNote = note.getParentNotes()[0];
const taskTemplate = api.searchForNote(`"Task Template"`);

const tasklib = require("./tasklib");

api.log("Detected new task note: " + note.noteId);

note.setRelation("template", taskTemplate.noteId);
note.setRelation("taskStatus", parentNote.noteId);
