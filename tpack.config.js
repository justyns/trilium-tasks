module.exports = {
  output: "dist/TriliumTasks.zip",
  notes: {
      title: "Trilium Tasks",
      file: "command-palette/palette-testing-widget.js",
      type: "code",
      env: "frontend",
      attributes: {
          "#run": "frontendStartup",
          "#run": "mobileStartup"
      },
      children: [
          {
              file: "command-palette/cmd-today.js",
              type: "code",
              env: "frontend",
              title: "Today's Note",
              attributes: {
                "cmdPaletteDesc": "Go to Today's note",
              }
          }
      ]
  }
};