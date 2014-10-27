/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */

var Promise = require('es6-promise').Promise;
var kurento = require('kurento-client');
var express = require('express');
var path = require('path');
var ws = require('ws');
var fs = require('fs');

var kurentoUri = 'ws://localhost:8888/kurento';
var streamUri = 'rtsp://172.17.42.1:8554/';

var clientPromise = kurento(kurentoUri)
.then(function(client) {
    console.log('Connected to kurento.', kurentoUri);
    return client;
})
['catch'](function(error) {
    console.error("Couldn't connect to kurento.", kurentoUri, error);
    return Promise.reject(error);
});

var pipelinePromise = clientPromise.then(function(kurentoClient) {
    return kurentoClient.create('MediaPipeline');
})
['catch'](function(error) {
    console.error("Couldn't create a pipeline.", error);
    return Promise.reject(error);
});

var streamEndpointPromise = pipelinePromise.then(function(pipeline) {
    return pipeline.create('PlayerEndpoint', {uri: streamUri})
    .then(function(playerEndpoint) {
        return playerEndpoint.play()
        .then(function() {
            return playerEndpoint;
        });
    });
})
['catch'](function(error) {
    console.error("Couldn't create the player endpoint.", error);
    return Promise.reject(error);
});

Promise.all([clientPromise, pipelinePromise, streamEndpointPromise])
.then(function(values) {
    var client = values[0];
    var pipeline = values[1];
    var streamEndpoint = values[2];

    var app = express();
    var port = process.env.PORT || 8080;
    app.set('port', port);
    app.use(express.static(path.join(__dirname, 'static')));

    var server = app.listen(port, function() {
        console.log('Express server started ');
        console.log('Connect to http://localhost:' + port + '/');
    });

    var wss = new ws.Server({
        server : server,
        path : '/call'
    });

    var viewers = {};

    var idCounter = 0;
    function nextUniqueId() {
        idCounter++;
        return idCounter.toString();
    }

    function startViewer(id, sdp, ws) {
        return new Promise(function(resolve, reject) {
            if (viewers[id]) {
                reject(
                    "You are already viewing in this session. " +
                    "Use a different browser to add additional viewers."
                )
            }

            pipeline.create('WebRtcEndpoint')
            .then(function(webRtcEndpoint) {
                return webRtcEndpoint.processOffer(sdp)
                .then(function(sdpAnswer) {
                    return streamEndpoint.connect(webRtcEndpoint)
                    .then(function() {
                        viewers[id] = {
                            id : id,
                            ws : ws,
                            webRtcEndpoint : webRtcEndpoint
                        };

                        resolve(sdpAnswer);
                    });
                })
            })
            ['catch'](function(error) {
                console.error('Viewer rejected', error);
                reject(error);
            });
        });
    }

    function stopViewer(id, ws) {
        if (viewers[id]) {
            var viewer = viewers[id];
            if (viewer.webRtcEndpoint)
                viewer.webRtcEndpoint.release();
            delete viewers[id];
        }
    }

    wss.on('connection', function(ws) {
        var sessionId = nextUniqueId();

        console.log('Connection received with sessionId ' + sessionId);

        ws.on('error', function(error) {
            console.log('Connection ' + sessionId + ' error');
            stopViewer(sessionId);
        });

        ws.on('close', function() {
            console.log('Connection ' + sessionId + ' closed');
            stopViewer(sessionId);
        });

        function send(data) {
            return new Promise(function (resolve, reject) {
                ws.send(JSON.stringify(data), function(error) {
                    if (error) { reject(error); }
                    else { resolve(); }
                });
            })
        }

        ws.on('message', function(_message) {
            var message = JSON.parse(_message);
            console.log('Connection ' + sessionId + ' received message ', message.id);

            switch (message.id) {
            case 'viewer':
                startViewer(sessionId, message.sdpOffer, ws)
                .then(function(sdpAnswer) {
                    return send({
                        id : 'viewerResponse',
                        response : 'accepted',
                        sdpAnswer : sdpAnswer
                    });
                })
                ['catch'](function(error) {
                    return send({
                        id : 'viewerResponse',
                        response : 'rejected',
                        message : error
                    });
                });
                break;
            case 'stop':
                stopViewer(sessionId);
                break;
            default:
                send({
                    id : 'error',
                    message : 'Invalid message ' + message
                });
                break;
            }
        });
    });
})
['catch'](function(errors) {
    console.error('Init failed.', errors);
    process.exit(1);
});
