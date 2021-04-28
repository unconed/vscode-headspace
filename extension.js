const vscode = require('vscode');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Local port
const PORT = 44100;

// Shared server instance
let headspace = null;

// Initialize server
const init = () => {
  if (!headspace) headspace = makeServer();
}

// Gather some action stats
const actions = {
  text: 0,
  file: 0,
  save: 0,
};

const countEvent = (type) => () => actions[type]++;

// Measure activity/hazard parameters
const measure = () => {
  let warnings = 0;
  let errors = 0;
  let hints = 0;

  const diags = vscode.languages.getDiagnostics();
  for (let [uri, ds] of diags) {
    for (let {severity} of ds) {
      if (severity === 0) errors++;
      if (severity === 3) warnings++;
      if (severity === 1) hints++;
    }
  }
   
  // Hazard goes from 0 -> 25% -> 50% -> 100% over hint, warning and error.
  const hazard = errors ? 1 : warnings ? 0.5 : hints ? 0.25 : 0;

  // Activity is based on accumulated / decaying actions.
  let {text, file, save} = actions;
  const activity = Math.min(1, 
    (1 - 1 / (save/2 + 1)) +
    (1 - 1 / (file/2 + 1)) +
    (1 - 1 / (text/16 + 1))
  );

  // Decay actions slowly
  actions.text = Math.max(0, actions.text * .7);
  actions.file = Math.max(0, actions.file * .95);
  actions.save = Math.max(0, actions.save * .9);
  
  // console.log({text, file, save, activity});

  return {
    activity,
    hazard,
    time: 5,
  };
}

// Notify listeners of new parameters
const notify = (listeners) => {
  const parameters = measure();
  const data = `data: ${JSON.stringify(parameters)}\n\n`;
  for (let l of listeners) l.write(data);
}

// Shut down server
const dispose = () => {
  if (headspace) {
    vscode.window.showInformationMessage(`Headspace server stopped`);
    headspace.stop();
    try {
      headspace.close();
    } catch (e) {};
    headspace = null;
    console.log(`Headspace server stopped`);
  }  
}

// Run an express server to server events
const makeServer = () => {
  const listeners = [];

  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  const eventsHandler = (request, response, next) => {
    const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    };
    response.writeHead(200, headers);

    listeners.push(response);
    request.on('close', () => {
      listeners.splice(listeners.indexOf(response), 1);
    });

    notify([response]);
  }

  app.get('/', eventsHandler);

  app.listen(PORT, () => {
    console.log(`Headspace server at http://localhost:${PORT}`)
		vscode.window.showInformationMessage(`Headspace server running at http://localhost:${PORT}`);
    vscode.env.openExternal(vscode.Uri.parse(`https://headspace.acko.net/#listen=:${PORT}`));
  });

  const timer = setInterval(() => notify(listeners), 2000);
  const stop = () => {
    clearInterval(timer);
    for (let l of listeners) try { l.close(); } catch (e) {};
  }
  app.stop = stop;

  return app;
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.headspace.start', init)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.headspace.stop', dispose)
  );
  context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(countEvent('text'))
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(countEvent('text'))
	);
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(countEvent('save'))
	);
	context.subscriptions.push(
		vscode.workspace.onDidCreateFiles(countEvent('file'))
	);
  context.subscriptions.push(
		vscode.workspace.onDidRenameFiles(countEvent('file'))
	);
  context.subscriptions.push(
		vscode.workspace.onWillDeleteFiles(countEvent('file'))
	);
}

function deactivate() {
  dispose();
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}

