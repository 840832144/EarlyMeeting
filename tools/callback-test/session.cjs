'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createOperationsLog}=require('./operations-log.cjs');

// Only finite diagnostic output reaches these files. No SDK output or payloads.
function createSession(directory, consoleOutput = console.log, {fileLogging=true,maxLogBytes=1024*1024,operationsLogDir}={}) {
  fs.mkdirSync(directory, {recursive: true});
  const statusPath = path.join(directory, 'status.log');
  const sessionPath = path.join(directory, 'session.json');
  const stopPath = path.join(directory, 'stop.json');
  const runId = randomUUID();
  const operationsLog=operationsLogDir?createOperationsLog(operationsLogDir):null;
  if(fileLogging)fs.writeFileSync(statusPath, '');
  const writeState = stopped => fs.writeFileSync(sessionPath,
    JSON.stringify({pid: process.pid, runId, stopped}));
  writeState(false);
  let timer;
  return {
    output(text) {
      consoleOutput(text);
      if(operationsLog)operationsLog(text);
      if(fileLogging){
        if(fs.statSync(statusPath).size>=maxLogBytes)fs.writeFileSync(statusPath,'');
        fs.appendFileSync(statusPath, new Date().toISOString() + ' ' + text + '\n');
      }
    },
    watchStop(stop) {
      timer = setInterval(() => {
        let request;
        try { request = JSON.parse(fs.readFileSync(stopPath, 'utf8')); } catch { return; }
        if (request.runId === runId) stop(0);
      }, 300);
    },
    finish() { clearInterval(timer); writeState(true); },
    runId,
  };
}
module.exports = {createSession};
