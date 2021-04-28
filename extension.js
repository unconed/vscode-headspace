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
    
  const hazard = errors ? 1 : warnings ? 0.5 : hints ? 0.25 : 0;

  return {
    activity: 0,
    hazard,
  };
}

// Notify listeners of new parameters
const notify = (listeners) => {
  console.log('notify', listeners)
  const parameters = measure();
  console.log('measure', parameters)
  const data = `data: ${JSON.stringify(parameters)}\n\n`;
  for (let l of listeners) l.write(data);
}

// Shut down server
const dispose = () => {
  if (headspace) {
    headspace.stop();
    headspace.close();
    headspace = null;
    console.log(`Headspace server stopped`);
    vscode.window.showInformationMessage(`Headspace server stopped`);
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
  });

  const timer = setInterval(() => notify(listeners), 1000);
  const stop = () => clearInterval(timer);
  app.stop = stop;

  return app;
}

function activate(context) {
  {
  	let disposable = vscode.commands.registerCommand('extension.headspace.start', init);
  	context.subscriptions.push(disposable);
  }
  {
  	let disposable = vscode.commands.registerCommand('extension.headspace.stop', dispose);
  	context.subscriptions.push(disposable);
  }
}

function deactivate() {
  dispose();
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}

