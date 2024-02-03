async function findRootTodoNote() {
  const rootTodoNote = await api.searchForNote('#tasksRoot');
  if (!rootTodoNote) return null;


  return rootTodoNote;
}

async function createNewNoteFolder(parentNoteId, noteTitle) {
 api.log("Creating new note: " + parentNoteId + " " + noteTitle);
 const newNote = await api.runOnBackend('api.createTextNote', [parentNoteId, noteTitle, ""]);
 const newNoteId = newNote.note.noteId;
 await api.waitUntilSynced();  // TODO: Is this needed after each note?
 api.log("Created new note: " + newNoteId);
 console.log(newNote);
 return newNoteId;
}

async function setNoteLabel(noteId, labelName, labelValue) {
  return await api.runOnBackend((noteId, labelName, labelValue) => {
      const note = api.getNote(noteId);
      note.setLabel(labelName, labelValue);
  }, [noteId, labelName, labelValue]);
}

async function setArchived(noteId) {
  return await api.runOnBackend((noteId) => {
      const note = api.getNote(noteId);
      note.addLabel('archived', null , true);
  }, [noteId]);
}

async function setupNewTodoRoot(rootTodoNote) {
  const rootTodoNoteId = rootTodoNote.noteId;
  const defaultStatuses = ['Backlog', 'Todo', 'In Progress', 'Done', 'Archived'];

  const todoVerLabel = rootTodoNote.getLabel('tasksVer');
  var todoVerValue = Number(todoVerLabel.value);
  if (todoVerValue === undefined || todoVerValue === null || todoVerValue < 1) {
    for(const status of defaultStatuses) {
        var noteId = await createNewNoteFolder(rootTodoNoteId, status);
        await setNoteLabel(noteId, 'tasksStatus', status);
        if (status == 'Archived') {
          await setArchived(noteId);
        }
    }
    todoVerValue = '1';
    await setNoteLabel(rootTodoNoteId, 'tasksVer', todoVerValue);
  }

  if (todoVerValue < 2) {
    var noteId = await createNewNoteFolder(rootTodoNoteId, 'Tags'); 
    await setNoteLabel(noteId, 'tasksTagsRoot', null);
    await setArchived(noteId);
    todoVerValue = '2';
    await setNoteLabel(rootTodoNoteId, 'tasksVer', todoVerValue);
  }

  await api.waitUntilSynced();
}

// TODO: Create special view notes like Kanban board and table/list view
// TODO: Use attachment notes with json to encrypt the metadata for the todo?
// TODO: Support multiple notes with the #todoRoot label
// TODO: Handle migrations for new root structures

var rootTodoNote = await findRootTodoNote();
if (rootTodoNote != null) {
  api.log("Found root todo note: " + rootTodoNote);
  setupNewTodoRoot(rootTodoNote);
}