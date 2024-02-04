const cssTPL = `
    .tasks-widget {
        padding: 10px; 
        border-top: 1px solid var(--main-border-color); 
        contain: none;
    }
`;
const TPL = `
<div id="tasks-widget" class="tasks-widget">
     <div class="tasks-widget-status-btns"></div>
</div>`;

class TaskControlWidget extends api.NoteContextAwareWidget {
  constructor() {
    super();
    this.taskStatuses = ["Backlog", "Todo", "In Progress", "Done", "Archived"];
    this.tagsRootLabel = "tasksTagsRoot";
    this.taskRootLabel = "tasksRoot";
    this.cssBlock(cssTPL);
  }

  get position() {
    return 99;
  }
  get parentWidget() {
    return "center-pane";
  }
  // get parentWidget() { return "note-detail-pane"; }

  isEnabled() {
    api.log("isEnabled?");
    if (!this.note) {
      // api.log("isEnabled?  No, note undefined");
      return false;
    }
    var aaaa = super.isEnabled();
    this.isNoteATask(this.note.noteId).then((isTask) => {
      aaaa = aaaa && isTask;
      // api.log("isEnabled? " + aaaa);
    });
    return aaaa;
  }

  async isNoteATask(noteId) {
    const taskRoot = await api.searchForNote(`#${this.taskRootLabel}`);
    if (!taskRoot) return false;
    const isATask = await this.note.hasAncestor(taskRoot.noteId);
    if (!isATask) return false;
    const hasTaskStatusLabel = await this.note.hasLabel("taskStatus");
    return hasTaskStatusLabel;
  }

  doRender() {
    // doRender seems to only get called once?   So there may be no note yet
    this.$widget = $(TPL);
    this.$btns = this.$widget.find(".tasks-widget-status-btns");
    // Create buttons for each task status
    for (const status of this.taskStatuses) {
      console.log(status);
      const $button = $(
        `<button id="status-${status}" class="btn btn-sm btn-primary">${status}</button>`,
      );
      $button.on("click", () => this.setTaskStatus(status));
      this.$btns.append($button);
    }

    // Create button for tag selection
    const $tagButton = $(
      `<button class="btn btn-sm btn-primary">Tags</button>`,
    );
    $tagButton.on("click", () => this.selectTags());
    this.$btns.append($tagButton);

    return this.$widget;
  }

  async refreshWithNote(note) {
    if (!(await this.isNoteATask(note.noteId))) {
      this.toggleInt(false);
    } else {
      this.toggleInt(true);
    }
  }

  async setTaskStatus(status) {
    const activeNote = this.note;
    const statusNote = await api.searchForNote(`#tasksStatus="${status}"`);
    console.log(`Cloning ${activeNote.noteId} to ${statusNote}`);
    const oldStatusId = await this.note.getOwnedRelationValue("taskStatus");
    console.log(`Old status: ${oldStatusId}`);
    // note.setRelation("taskStatus", parentNote.noteId);
    // await api.setAttribute(noteId, 'taskStatus', status);
    await api.runOnBackend(
      (noteId, newStatusNoteId, oldStatusId) => {
        // note.cloneTo(newStatusNoteId);
        // Not sure if cloneTo does something different, but we'd need to delete the old branch anyway
        api.toggleNoteInParent(true, noteId, newStatusNoteId);
        api.toggleNoteInParent(false, noteId, oldStatusId);
      },
      [activeNote.noteId, statusNote.noteId, oldStatusId],
    );
    await api.waitUntilSynced();
    api.showMessage(`Task status set to ${status}`);
  }

  async selectTags() {
    const tagsRootNote = await this.getTagsRootNote();
    if (!tagsRootNote) {
      api.showError("Tags root note not found.");
      return;
    }

    const tags = await api.searchForNotes(
      `note.ancestors.noteId = ${tagsRootNote.noteId} and note.noteId != ${tagsRootNote.noteId} `,
    );
    const tagOptions = tags.map((tag) => tag.title).join(", ");
    var tagMapping = {};
    tags.forEach((tag) => {
      tagMapping[tag.title] = tag.noteId;
    });
    console.log("Tag Mapping: ", tagMapping);
    console.log("Found tags: " + tagOptions);

    // I should use some sort of autocomplete style thing for this, not just a csv
    const selectedTags = await api.showPromptDialog({
      title: "Select Tags",
      message: "Choose tags:",
      defaultValue: tagOptions,
    });

    if (selectedTags) {
      const selectedTagList = selectedTags.split(",").map((tag) => tag.trim());
      var newTagIds = [];
      selectedTagList.forEach((tag) => {
        const tagNoteId = tagMapping[tag];
        if (tagNoteId) {
          newTagIds.push(tagNoteId);
        }
      });
      api.runOnBackend(
        (noteId, newTagIds) => {
          const note = api.getNote(noteId);
          const existingTags = note
            .getRelations("tag")
            .map((rel) => rel.targetNoteId);

          const tagsToAdd = newTagIds.filter(
            (id) => !existingTags.includes(id),
          );
          const tagsToRemove = existingTags.filter(
            (id) => !newTagIds.includes(id),
          );

          tagsToRemove.forEach((tagNoteId) => {
            note.removeRelation("tag", tagNoteId);
          });
          tagsToAdd.forEach((tagNoteId) => {
            note.addRelation("tag", tagNoteId);
          });
        },
        [this.note.noteId, newTagIds],
      );
      api.showMessage(`Tags set to ${selectedTagList.join(", ")}`);
    }
  }

  async getTagsRootNote() {
    const tagsRootNotes = await api.searchForNotes("#tasksTagsRoot");
    return tagsRootNotes.length > 0 ? tagsRootNotes[0] : null;
  }
}

module.exports = new TaskControlWidget();
