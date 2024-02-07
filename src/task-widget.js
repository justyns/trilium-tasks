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

// tasklib needs to be a child note (clone)
// TODO: Can I require/import a note from somewhere else instead?
// const tasklib = require("./tasklib");

class TaskControlWidget extends api.NoteContextAwareWidget {
  constructor() {
    super();
    this.taskStatuses = ["Backlog", "Todo", "In Progress", "Done", "Archived"];
    this.tagsRootLabel = "tasksTagsRoot";
    this.taskRootLabel = "tasksRoot";
    this.isTask = false;
    this.cssBlock(cssTPL);

    console.log(`parentWidget: `, TaskControlWidget.parentWidget);
  }

  async updateIsTask() {
    if (this.note) {
      this.isTask = await this.isNoteATask(this.note.noteId);
    } else {
      this.isTask = false;
    }
  }

  static get position() {
    return 99;
  }

  static get parentWidget() {
    return "center-pane";
  }

  isEnabled() {
    const isEnabled = super.isEnabled();
    console.log("super.isEnabled() returned:", isEnabled);
    console.log("this.isTask is:", this.isTask);
    console.log("this.note is:", this.note);
    return this.updateIsTask().then(() => {
      console.log("this.isTask is now:", this.isTask);
      return isEnabled && this.isTask;
    });
  }

  async isNoteATask(noteId) {
    const taskRoot = await api.searchForNote(`#${this.taskRootLabel}`);
    console.log("taskRoot is:", taskRoot);
    if (!taskRoot) return false;
    const isATask = await this.note.hasAncestor(taskRoot.noteId);
    console.log("isATask is:", isATask);
    if (!isATask) return false;
    const hasTaskStatusLabel = await this.note.hasRelation("taskStatus");
    console.log("hasTaskStatusLabel is:", hasTaskStatusLabel);
    return hasTaskStatusLabel;
  }

  doRender() {
    // doRender seems to only get called once?   So there may be no note yet
    console.log("doRender called with note:", this.note);
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
    console.log("refreshWithNote called with note:", note);
    await this.updateIsTask();
    console.log("Is this note a task? ", this.isTask);
    if (this.isTask) {
      console.log("Enabling widget for task note.");
      this.toggleInt(true);
    } else {
      console.log("Disabling widget as this is not a task note.");
      this.toggleInt(false);
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

  async entitiesReloadedEvent({ loadResults }) {
    if (loadResults.isNoteContentReloaded(this.noteId)) {
      this.refresh();
    }
  }
}

module.exports = TaskControlWidget;