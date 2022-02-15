var sourcemapsReaderServer = require('./servers/sourcemaps-server');
var {peerRouter, peerConnection, peerDisconnect, peerError} = require('./servers/peerjs-server');
var express = require('express');
const {ExpressPeerServer} = require('peer');
const socket = require("./servers/websocket");

const HOST = '0.0.0.0';
const PORT = 9000;

var app = express();
let debug = process.env.debug === "1" || false;
const request_logger = (identity) => {
    return (req, res, next) => {
        debug && console.log(identity, new Date().toTimeString(), 'REQUEST', req.method, req.originalUrl);
        res.on('finish', function () {
            if (this.statusCode !== 200 || debug) {
                console.log(new Date().toTimeString(), 'RESPONSE', req.method, req.originalUrl, this.statusCode);
            }
        })

        next();
    }
};
app.use(request_logger("[app]"));

app.use('/sourcemaps', sourcemapsReaderServer);
app.use('/assist', peerRouter);

const server = app.listen(PORT, HOST, () => {
    console.log(`App listening on http://${HOST}:${PORT}`);
    console.log('Press Ctrl+C to quit.');
});

const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/',
    proxied: true,
    allow_discovery: false
});
peerServer.on('connection', peerConnection);
peerServer.on('disconnect', peerDisconnect);
peerServer.on('error', peerError);
app.use('/', peerServer);
app.enable('trust proxy');


const {App} = require("uWebSockets.js");
const PREFIX = process.env.prefix || '/assist'

const uapp = new App();

const healthFn = (res, req) => {
    res.writeStatus('200 OK').end('ok!');
}
uapp.get(PREFIX, healthFn);
uapp.get(`${PREFIX}/`, healthFn);

const uWrapper = function (fn) {
    return (res, req) => fn(req, res);
}
uapp.get(`${PREFIX}/${process.env.S3_KEY}/sockets-list`, uWrapper(socket.handlers.socketsList));
uapp.get(`${PREFIX}/${process.env.S3_KEY}/sockets-list/:projectKey`, uWrapper(socket.handlers.socketsListByProject));

uapp.get(`${PREFIX}/${process.env.S3_KEY}/sockets-live`, uWrapper(socket.handlers.socketsLive));
uapp.get(`${PREFIX}/${process.env.S3_KEY}/sockets-live/:projectKey`, uWrapper(socket.handlers.socketsLiveByProject));


socket.start(uapp);

uapp.listen(HOST, PORT + 1, (token) => {
    if (!token) {
        console.warn("port already in use");
    }
    console.log(`WS App listening on http://${HOST}:${PORT + 1}`);
    console.log('Press Ctrl+C to quit.');
});


module.exports = {uapp, server};
