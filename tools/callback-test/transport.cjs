'use strict';
const https = require('node:https');

// An observer on this WSClient's documented agent hook only. It preserves the
// current HTTPS agent options, certificate checks and destination chosen by SDK.
function diagnosticAgent(output, diagnosis, state) {
  class ObservedAgent extends https.Agent {
    addRequest(request, options) {
      const emit = error => {
        if (!state.stopping) output('[TRANSPORT_DIAG] ' + diagnosis(error, 'WEBSOCKET'));
      };
      request.once('error', emit);
      request.once('response', response => emit({status:response.statusCode}));
      request.once('upgrade', response => {
        if (response.statusCode === 101) output('[WS_UPGRADE] http=101');
      });
      request.once('socket', socket => {
        socket.on('connectionAttemptFailed', (_address, _port, family, error) => {
          if (!state.stopping) output('[TCP_ATTEMPT_FAILED] family=' +
            ([4,6].includes(family) ? family : 'UNREPORTED') + '; ' + diagnosis(error, 'WEBSOCKET'));
        });
        socket.on('connectionAttemptTimeout', (_address, _port, family) => {
          if (!state.stopping) output('[TCP_ATTEMPT_TIMEOUT] family=' +
            ([4,6].includes(family) ? family : 'UNREPORTED'));
        });
      });
      return super.addRequest(request, options);
    }
  }
  return new ObservedAgent({...https.globalAgent.options});
}
module.exports = {diagnosticAgent};
