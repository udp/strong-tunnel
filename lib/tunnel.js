var net = require('net');
var ssh2 = require('ssh2');

module.exports = makeTunnel;

function makeTunnel(urlObj, callback) {
  var conn = new ssh2.Client();
  var env = process.env;
  var username = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

  conn.on('ready', function() {
    makeProxy(conn, urlObj, callback);
    // don't keep the process alive if all we have is this connection
    conn._sock.unref();
  }).on('error', function(err) {
    console.error('ssh connection error: ', err);
  }).connect({
    // extract hostname from url
    host: urlObj.hostname,
    // assume ssh is on port 22, not configurable (yet?)
    port: 22,
    // assume ssh user is the same as current user
    username: username,
    // assume an ssh agent is already running
    agent: process.env.SSH_AUTH_SOCK,
  });
}

function makeProxy(conn, urlObj, callback) {
  var lAddr = '127.0.0.1';
  // connect to remote localhost from the remote host
  var rAddr = '127.0.0.1';
  // don't conflict with anything
  var lPort = 0;
  // use the port from the input URL
  var rPort = urlObj.port;

  var server = net.createServer(function(c) {
    conn.forwardOut(lAddr, lPort, rAddr, rPort, function(err, stream) {
      stream.pipe(c).pipe(stream);
      c.on('error', console.error.bind('proxy request error: '));
      stream.on('error', console.error.bind('ssh stream error: '));
    });
  });

  // listen on an ephemeral port and modify the input URL to connect to us
  // instead of the original target
  server.listen(0, function() {
    // compose URL for connecting to this little TCP proxy server
    urlObj.port = server.address().port;
    urlObj.hostname = '127.0.0.1';
    callback(null, urlObj);
  });

  server.on('error', console.error.bind('proxy server error: '));

  // don't let this server keep the process alive
  server.unref();
}